The only good Discord PUG bot

# Installing

Install nodejs and download this repo

# Running

Create config.js:

```js
/*
 * go to https://discordapp.com/developers/applications/
 * then to Bot in the sidebar, then copy your token from that page
 */
exports.TOKEN = "";

// the bot dumps roles if this isn't set, copy the ID here
exports.OP_ROLE = "";
// say !pickuphere in the channel you want and then look at the bot's stdout
exports.PICKUP_CHANNEL = "";
// find an emoji ID
exports.GOODGAME_EMOJI = "";

exports.IP = "1.2.3.4";
exports.PASSWORD = "pickup";
	
exports.REQUIRED_PLAYERS = 2;
exports.AFK_TIME = 10 * 60;
exports.UNAFK_DELAY = 30;
exports.UNAFK_HIGHLIGHTS = 4;
exports.OFFLINE_DELAY = 5 * 60;
```

and then run:

	./main.js

All the dependencies are in this repo so you don't have to fuck about
with npm.
