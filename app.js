const express = require("express");
const app = express();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(checkUser);
  console.log(databaseUser);

  if (databaseUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const requestQuery = `insert into user(name, username, password, gender) values (
          '${name}','${username}','${hashedPassword}','${gender}');`;
      await database.run(requestQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(checkUser);

  if (databaseUser !== undefined) {
    const checkPassword = await bcrypt.compare(password, databaseUser.password);

    if (checkPassword === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, name, username, gender } = payload;
  console.log(name);
  const getTweetQuery = `SELECT 
                                username,
                                tweet, 
                                date_time AS dateTime 
                         FROM 
                                follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id 
                         WHERE 
                                follower.follower_user_id = ${user_id}
                         ORDER BY 
                               date_time DESC 
                         LIMIT 4 ;`;

  const responseResult = await database.all(getTweetQuery);
  response.send(responseResult);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const getFollowerIdsQuery = `select following_user_id from follower where follower_user_id = ${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });
  const getFollowersResultQuery = `select name from user where user_id in (${getFollowerIds});`;
  const responseResult = await database.all(getFollowersResultQuery);
  response.send(responseResult);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const getFollowerIdsQuery = `select following_user_id from follower where follower_user_id = ${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });
  console.log(`${getFollowerIds}`);

  const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
  const responseResult = await database.all(getFollowersNameQuery);
  response.send(responseResult);
});

const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id = ${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    const getFollowingIds = getFollowingIdsArray.map((eachUser) => {
      return eachUser.following_user_id;
    });
    console.log(`${getFollowerIds}`);

    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIds = await database.all(getTweetIdsQuery);
    const followingTweetIds = getTweetIds.map((eachId) => {
      return eachId.tweet_id;
    });

    if (followingTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like on user.user_id=like.user_id
                    where like.tweet_id=${tweetId};`;
      const getLikedUsersNamesArray = await database.get(
        getLikedUsersNameQuery
      );
      const getLikedUsersNames = getLikedUsersNamesArray.map((eachUser) => {
        return eachUser.likes;
      });

      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUsersNames)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id = ${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);

    const getFollowingIds = getFollowingIdsArray.map((eachUser) => {
      return eachUser.following_user_id;
    });
    console.log(`${getFollowerIds}`);

    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIds = await database.all(getTweetIdsQuery);
    const followingTweetIds = getTweetIds.map((eachId) => {
      return eachId.tweet_id;
    });

    if (followingTweetIds.includes(parseInt(tweetId))) {
      const getUsersNameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.reply
                    where reply.tweet_id=${tweetId};`;
      const getUsersNamesReplyTweets = await database.get(
        getUsersNameReplyTweetsQuery
      );

      response.send(
        convertUserNameReplyedDBObjectToResponseObject(getUsersNamesReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const { tweet } = request.body;

  const currentData = new Date();
  console.log(currentData.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentData}';`;

  const responseResult = await database.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
    const getUserId = await database.get(getUserIdQuery);

    const getUserTweetsListQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
    const getUserTweetsListArray = await database.get(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });

    console.log(getUserTweetsList);

    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
