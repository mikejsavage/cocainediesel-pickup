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

exports.GAMETYPES = { "5v5": 10, "3v3": 6 };
exports.DEFAULT_GAMETYPE = "5v5";
```

and then run:

	./main.js

All the dependencies are in this repo so you don't have to fuck about
with npm.
