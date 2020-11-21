#! /usr/bin/env node

const fs = require( "fs" );
const util = require( "util" );

process.env[ "NODE_PATH" ] = __dirname;
require( "module" ).Module._initPaths();

const Eris = require( "eris" );

const config = require( "./config" );

let client;

let last_name = { };
let last_message = { };

let gametypes = { };
for( let gt in config.GAMETYPES ) {
	gametypes[ gt ] = { required: config.GAMETYPES[ gt ], added: [ ] };
};

let afkers;
let pending_gt;
let pending_game_unique;

let icons = [ ];
for( let i = 0; i <= 10; i++ ) {
	icons[ i ] = fs.readFileSync( i + ".jpg", "base64" );
}

// returns a unique value so we can compare with some reference to make sure it
// hasn't changed. used to e.g. halt the first set of afk checks if two games
// start right after each other
// implementation is trivial but give it a name for documentation purposes
function make_unique() {
	return { };
}

function unixtime() {
	return new Date().getTime() / 1000;
}

function seconds( s ) {
	return s * 1000;
}

function minutes( m ) {
	return seconds( m * 60 );
}

function error_cb( context, error ) {
	console.log( context + ": " + error );
}

function say( fmt, ...args ) {
	if( typeof fmt == "object" ) {
		say( "%s", fmt.join( "\n" ) );
		return;
	}

	client.createMessage( get_channel().id, util.format( fmt, ...args ) ).catch( "say", error_cb );
}

function get_server() {
	return client.guilds.get( client.channelGuildMap[ config.PICKUP_CHANNEL ] );
}

function get_channel() {
	return get_server().channels.get( config.PICKUP_CHANNEL );
}

function update_channel_name() {
	let gametype = gametypes[ config.DEFAULT_GAMETYPE ];
	let wrestlers = String.fromCodePoint( 0x1f93c );
	let left_bracket = "\uff3b";
	let right_bracket = "\uff3d";
	let slash = "\uff89";

	get_channel().edit( {
		name: util.format( "%spickup%s%d%s%d%s", wrestlers,
			left_bracket, gametype.added.length, slash, gametype.required, right_bracket ),
	} ).catch( "update_channel_name", error_cb );
}

function get_name( id ) {
	let name = get_server().members.get( id ) != null ? get_server().members.get( id ).nick : null;
	if( name == null ) console.log( "lol what son" );
	return name != null ? name : last_name[ id ];
}

function pad_centred( str, width ) {
	let left = Math.floor( ( width - str.length ) / 2 );
	let right = width - str.length - left;
	return " ".repeat( left ) + str + " ".repeat( right );
}

function gametype_status( name ) {
	let gt = gametypes[ name ];
	let added = String( gt.added.length ).padStart( 2 );
	let required = String( gt.required ).padEnd( 2 );
	const names = gt.added.length == 0 ? "dead game" : gt.added.map( get_name ).join( ", " );
	return util.format( "%s/%s |%s| %s", added, required, pad_centred( name, 11 ), names );
}

function sorted_gametypes() {
	let sorted = [ ];
	for( let gt in gametypes ) {
		sorted.push( gt );
	}

	sorted.sort( ( a, b ) => gametypes[ a ].added.length < gametypes[ b ].added.length );

	return sorted;
}

function brief_status() {
	let gts = sorted_gametypes();
	gts = gts.map( gt => util.format( "%s [%d/%d]", gt, gametypes[ gt ].added.length, gametypes[ gt ].required ) );
	return gts.join( " - " );
}

function remove_player( gt, id ) {
	const idx = gametypes[ gt ].added.indexOf( id );
	if( idx != -1 ) {
		gametypes[ gt ].added.splice( idx, 1 );
		update_channel_name();
	}
	return idx != -1;
}

function remove_player_from_all( id ) {
	let was_added = false;
	for( let gt in gametypes ) {
		if( remove_player( gt, id ) )
			was_added = true;
	}
	return was_added;
}

function emoji_border( emoji, msg ) {
	msg.splice( 0, 0, emoji.repeat( 20 ) );
	msg.push( emoji.repeat( 20 ) );
	say( msg );
}

function copy_array( arr ) {
	return arr.slice();
}

function start_the_game() {
	const gg = "<:goodgame:" + config.GOODGAME_EMOJI + ">";
	emoji_border( gg, [
		"PLEASE HAVE A GOOD GAME",
		gametypes[ pending_gt ].added.map( id => "<@" + id + ">" ).join( " " ),
	] );

	let added_copy = copy_array( gametypes[ pending_gt ].added );
	for( let id of added_copy ) {
		remove_player_from_all( id );
	}

	afkers = undefined;
	pending_gt = undefined;
	pending_game_unique = undefined;
}

function check_afk( attempt, unique ) {
	if( unique != pending_game_unique )
		return;

	if( afkers.length == 0 ) {
		start_the_game();
		return;
	}

	const max_unafk_highlights = 4;
	if( attempt == max_unafk_highlights ) {
		afkers.forEach( id => remove_player_from_all( id ) );
		const cross = "\u274c";
		emoji_border( cross, [
			afkers.map( id => "<@" + id + ">" ).join( " " ) + " fucked it up for everyone",
			brief_status(),
		] );

		afkers = undefined;
		pending_gt = undefined;
		pending_game_unique = undefined;

		return;
	}

	const warning = "\u26a0";
	emoji_border( warning, [
		"Some people are AFK! Say something so we can start the game",
		afkers.map( id => "<@" + id + ">" ).join( " " ),
	] );

	setTimeout( () => check_afk( attempt + 1, unique ), seconds( 30 ) );
}

function unafk( message ) {
	if( afkers == undefined )
		return;

	const idx = afkers.indexOf( message.author.id );
	if( idx == -1 )
		return;

	afkers.splice( idx, 1 );

	message.addReaction( String.fromCodePoint( 0x1f44d ) );

	if( afkers.length == 0 ) {
		start_the_game();
	}
}

function words( str ) {
	return str.split( " " ).filter( word => word.length > 0 );
}

function match( re, str ) {
	const matches = re.exec( str );
	if( matches == undefined )
		return undefined;
	return matches[ 1 ];
}

function add_command( id, args ) {
	if( pending_game_unique != undefined )
		return;

	let gts = words( args );
	if( gts.length == 0 )
		gts = [ config.DEFAULT_GAMETYPE ];

	let did_add = false;
	for( let gt of gts ) {
		if( !( gt in gametypes ) )
			continue;

		if( gametypes[ gt ].added.includes( id ) )
			continue;

		gametypes[ gt ].added.push( id );
		did_add = true;

		if( gametypes[ gt ].added.length == gametypes[ gt ].required ) {
			const now = unixtime();
			afkers = gametypes[ gt ].added.filter( id => last_message[ id ] < now - minutes( 10 ) );
			pending_gt = gt;
			pending_game_unique = make_unique();
			check_afk( 1, pending_game_unique );
			return;
		}
	}

	if( did_add ) {
		say( "%s", brief_status() );
		update_channel_name();
	}
}

function remove_command( id, args ) {
	if( pending_game_unique != undefined )
		return;

	let was_added = false;

	let gts = words( args );
	if( gts.length == 0 ) {
		was_added = remove_player_from_all( id );
	}
	else {
		for( let gt of gts ) {
			if( !( gt in gametypes ) )
				continue;

			if( remove_player( gt, id ) )
				was_added = true;
		}
	}

	if( was_added )
		say( "%s", brief_status() );
}

function who_command() {
	let gts = sorted_gametypes().map( gametype_status );
	gts.splice( 0, 0, "```" );
	gts.push( "```" );
	say( gts );
}

const op_commands = {
	pickuphere: function( message ) {
		console.log( "exports.PICKUP_CHANNEL = \"%s\";", message.channel.id );
	},

	opremove: function( message, args ) {
		if( pending_game_unique != undefined )
			return;

		const target = match( /<@!(\d+)>/, args );
		if( target ) {
			let was_added = remove_player_from_all( target );
			if( was_added )
				say( "%s", brief_status() );
			else
				say( "they aren't added" );
		}
	},
};

const normal_commands = [
	{ pattern: /^!add\s*(.*)/, callback: add_command },
	{ pattern: /^\+\+/, callback: add_command },
	{ pattern: /^\+(.+)/, callback: add_command },

	{ pattern: /^!remove\s*(.*)/, callback: remove_command },
	{ pattern: /^--/, callback: remove_command },
	{ pattern: /^-(.+)/, callback: remove_command },

	{ pattern: /^!who/, callback: who_command },
	{ pattern: /^\?\?/, callback: who_command },
];

function try_commands( cmds, message, content ) {
	const space_pos = content.indexOf( " " );
	const cmd = space_pos == -1 ? content : content.substr( 0, space_pos );
	const rest = space_pos == -1 ? "" : content.substr( space_pos ).trim();

	if( cmds[ cmd ] ) {
		cmds[ cmd ]( message, rest );
		return true;
	}

	return false;
}

let offline_uniques = { };

function remove_offline( user, unique ) {
	if( unique != offline_uniques[ user.id ] )
		return;

	if( remove_player_from_all( user.id ) ) {
		say( [
			user.nick + " went offline and was removed",
			brief_status(),
		] );
	}
}

function on_ready() {
	if( config.OP_ROLE == undefined || config.OP_ROLE == "" ) {
		console.log( "You need to set OP_ROLE" );
		for( const [ id, role ] of get_server().roles.entries() ) {
			console.log( "Role %s: exports.OP_ROLE = \"%s\";", role.name, id );
		}
		process.exit( 1 )
	}

	if( get_server().roles.get( config.OP_ROLE ) == null ) {
		console.log( "That OP_ROLE doesn't exist" );
		for( const [ id, role ] of get_server().roles.entries() ) {
			console.log( "Role %s: exports.OP_ROLE = \"%s\";", role.name, id );
		}
	}

	console.log( "Connected" );

	update_channel_name();
}

function on_message( message ) {
	if( message.author.id == client.user.id )
		return;

	last_name[ message.author.id ] = message.author.nick;
	last_message[ message.author.id ] = unixtime();

	if( config.PICKUP_CHANNEL != undefined && message.channel.id != config.PICKUP_CHANNEL )
		return;

	unafk( message );

	let content = message.content.toLowerCase();

	if( content[ 0 ] == '!' ) {
		const member = get_server().members.get( message.author.id );
		if( member.roles == null ) {
			console.log( "????" );
			console.log( member );
		}
		const is_op = member.roles.includes( config.OP_ROLE );
		if( is_op && try_commands( op_commands, message, content.substr( 1 ) ) )
			return;
	}

	for( let cmd of normal_commands ) {
		let e = cmd.pattern.exec( content );
		if( e == null )
			continue;
		cmd.callback( message.author.id, e[ 1 ] || "" );
	}
}

function on_presence( user ) {
	if( user.status == "online" ) {
		offline_uniques[ user.id ] = undefined;
	}

	if( user.status == "offline" ) {
		// mark them as AFK and remove them if they don't come back
		last_message[ user.id ] = unixtime() - config.AFK_TIME - 1;
		const unique = make_unique();
		offline_uniques[ user.id ] = unique;
		setTimeout( () => remove_offline( user, unique ), seconds( 5 ) );
	}
}

function on_guildMemberRemove( guild, member ) {
	if( remove_player_from_all( member.id ) ) {
		say( [
			member.username + " left the server and was removed",
			brief_status(),
		] );
	}
}

client = new Eris( config.TOKEN );

client.on( "ready", on_ready );
client.on( "messageCreate", on_message );
client.on( "presenceUpdate", on_presence );
client.on( "guildMemberRemove", on_guildMemberRemove );

client.on( "disconnect", () => client.connect() );
client.on( "error", ( e ) => console.log( e.name + ": " + e.message ) );

// update the server icon. discord rate limit is 5mins on this
setInterval( function() {
	let server = get_server();
	if( server == null )
		return;

	let gametype = gametypes[ config.DEFAULT_GAMETYPE ];
	server.edit( { icon: "data:image/jpeg;base64," + icons[ gametype.added.length ] } )
		.catch( "set server icon", error_cb );
}, minutes( 5 ) + seconds( 1 ) );
