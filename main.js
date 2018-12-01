#! /usr/bin/env node

process.env[ "NODE_PATH" ] = __dirname;
require( "module").Module._initPaths();

const util = require( "util" );
const Discord = require( "discord" );

const config = require( "./config" );

let client = new Discord.Client( {
	autorun: true,
	token: config.TOKEN,
} );

let server;

client.on( "ready", function() {
	for( const server_id in client.servers ) {
		server = client.servers[ server_id ];
		break;
	}

	if( config.OP_ROLE == undefined || config.OP_ROLE == "" ) {
		console.log( "You need to set OP_ROLE" );
		for( const role_id in server.roles ) {
			const role = client.servers[ server_id ].roles[ role_id ];
			console.log( "Role %s: exports.OP_ROLE = \"%s\";", role.name, role_id );
		}
		client.disconnect();
	}
	console.log( "rdy" );
} );

let last_name = { };
let last_message = { };
let added = [ ];
let afkers;
let pending_game;

function unixtime() {
	return new Date().getTime() / 1000;
}

let last_channel;
function say( fmt, ...args ) {
	if( typeof fmt == "object" ) {
		say( "%s", fmt.join( "\n" ) );
		return;
	}

	client.sendMessage( {
		to: last_channel,
		message: util.format( fmt, ...args ),
	} );
}

function get_name( id ) {
	return server.members[ id ].nick || last_name[ id ];
}

function get_status() {
	const names = added.length == 0 ? "frown town" : added.map( get_name ).join( ", " );
	return util.format( "%d/%d: %s", added.length, config.REQUIRED_PLAYERS, names );
}

function say_status() {
	say( "%s", get_status() );
}

function remove_player( user ) {
	const idx = added.indexOf( user );
	if( idx != -1 )
		added.splice( idx, 1 );
	return idx != -1;
}

function start_the_game() {
	const gg = "<:goodgame:" + config.GOODGAME_EMOJI + ">";
	const msg = [
		gg.repeat( 20 ),
		gg + " " + "CONNECT TO THE SERVER: connect " + config.IP + ";password " + config.PASSWORD,
		gg + " " + "OR CLICK HERE: http://cocainediesel.mikejsavage.co.uk/diesel.html?" + config.PASSWORD + "@" + config.IP,
		gg + " " + added.map( id => "<@" + id + ">" ).join( " " ),
		( "<:goodgame:" + config.GOODGAME_EMOJI + ">" ).repeat( 20 ),
	];

	say( msg );
	added = [ ];
	afkers = undefined;
	pending_game = undefined;
}

function check_afk( attempt, game ) {
	if( game != pending_game )
		return;

	if( afkers.length == 0 ) {
		start_the_game();
		return;
	}

	if( attempt == config.UNAFK_ATTEMPTS ) {
		afkers.forEach( id => remove_player( id ) );
		const td = String.fromCodePoint( 0x1f44e );
		const msg = [
			td.repeat( 20 ),
			td + " " + afkers.map( id => "<@" + id + ">" ).join( " " ) + " fucked it up for everyone",
			td + " " + get_status(),
			td.repeat( 20 ),
		];
		say( msg );
		return;
	}

	const sw = "\u23f1";
	const msg = [
		sw.repeat( 20 ),
		sw + " Some people are AFK! Say something so we can start the game",
		sw + " " + afkers.map( id => "<@" + id + ">" ).join( " " ),
		sw.repeat( 20 ),
	];

	say( msg );

	setTimeout( function() {
		check_afk( attempt + 1, game );
	}, config.UNAFK_DELAY );
}

function unafk( channelID, messageID, userID ) {
	if( afkers == undefined )
		return;

	const idx = afkers.indexOf( userID );
	if( idx == -1 )
		return;

	afkers.splice( idx, 1 );

	client.addReaction( {
		channelID: channelID,
		messageID: messageID,
		reaction: String.fromCodePoint( 0x1f44d ),
	} );

	if( afkers.length == 0 ) {
		start_the_game();
	}
}

function tick() {
	if( added.length == config.REQUIRED_PLAYERS ) {
		const now = unixtime();
		afkers = added.filter( id => last_message[ id ] < now - config.AFK_TIME );
		pending_game = { }
		check_afk( 0, pending_game );
		return;
	}

	say_status();
}

const op_commands = {
	pickuphere: function() {
		console.log( "exports.PICKUP_CHANNEL = \"%s\";", last_channel );
	},

	opremove: function( user, args ) {
		if( !remove_player( args ) ) {
			say( "they aren't added" );
		}
	},
};

const normal_commands = {
	add: function( user ) {
		if( pending_game == undefined && !added.includes( user ) ) {
			added.push( user );
			tick();
		}
	},

	remove: function( user ) {
		if( pending_game == undefined && remove_player( user ) ) {
			say_status();
		}
	},

	who: say_status,
};

function try_commands( cmds, user, channel, message ) {
	const space_pos = message.indexOf( " " );
	const cmd = space_pos == -1 ? message : message.substr( 0, space_pos );
	const rest = space_pos == -1 ? "" : message.substr( space_pos ).trim();

	if( cmds[ cmd ] ) {
		cmds[ cmd ]( user, rest );
		return true;
	}

	return false;
}

client.on( "message", function( user, userID, channelID, message, e ) {
	last_name[ userID ] = user;
	last_message[ userID ] = unixtime();

	unafk( channelID, e.d.id, userID );

	if( config.PICKUP_CHANNEL != undefined && channelID != config.PICKUP_CHANNEL )
		return;

	if( userID == client.id )
		return;

	if( message[ 0 ] != '!' )
		return;

	last_channel = channelID;

	const is_op = e.d.member.roles.includes( config.OP_ROLE );
	if( is_op && try_commands( op_commands, userID, channelID, message.substr( 1 ) ) )
		return;

	try_commands( normal_commands, userID, channelID, message.substr( 1 ) );
} );

client.on( "presence", function( user, userID, status ) {
	if( status == "offline" ) {
		if( remove_player( userID ) ) {
			say( "%s went offline and was removed", user );
		}
	}
} );
