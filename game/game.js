var express = require('express')
const util = require('util')
var router = express.Router()

// get player manager
const playerManager = require('./player/player')

// get database
const db = require('../index').db

// game event emitter
const EventEmitter = require('events');
const gameEvent = new EventEmitter()

// game info class
function GameInfo (gameId, start_color, moves, sixes, consecutive_sixes) {
    this.gameId = gameId
    this.start_color = start_color
    this.moves = moves
    this.sixes = sixes
    this.consecutive_sixes = consecutive_sixes

    this.getID() = function() {return this.gameId }
    this.setID() = function(id) { this.gameId = id }

}

// initializes the game database
async function initDB() {
    // board table stores position of pawns of each player in the game
    await db.run(`CREATE TABLE IF NOT EXISTS board (gameId varchar(5), player int, color int, balance int DEFAULT 0, p0 int DEFAULT -1, p1 int DEFAULT -1, p2 int DEFAULT -1, p3 int DEFAULT -1)`)
    // game table stores game start color and current number of moves
    await db.run(`CREATE TABLE IF NOT EXISTS game (gameId varchar(5), start_color int DEFAULT 0, moves int DEFAULT 0, sixes int DEFAULT 0, consecutiveSixes DEFAULT 0)`)
}

// generates a unique game id
function generateUniqueGameId() {
    // generates a 5 digit game id
    var gameId = Math.round(Math.random() * 100000).toString()
    // pad with zeroes
    return gameId.padStart(5, '0')
}

// pawn starting positions
const START_POSITIONS = [
    0, 13, 26, 39
]

// safe zone starting positions
const SAFE_ZONE_START_POSITIONS = [
    52, 57, 62, 67
]

// colors
const BOARD_COLORS = [
    'BLUE', 'GREEN', 'RED', 'YELLOW'
]

// get game info of a certain game
async function getGameInfo(gameId) {
    return await db.get('SELECT * FROM game WHERE gameId = ?', [gameId])
}

// get board info of a certain game
async function getGameBoard(gameId) {
    return await db.all(`SELECT * FROM board WHERE gameId = ? ORDER BY color`, [gameId])
}

// get player on the board
async function getGameBoardPlayer(gameId, playerId) {
    return await db.get('SELECT * FROM board WHERE gameId = ? AND player = ?', [gameId, playerId])
}

// creates a new game given id
async function createGame(gameId) {
    await db.run(`INSERT INTO game (gameId, start_color) VALUES (?, ?)`, [gameId, Math.round(Math.random() * 4)])
    console.log(`New game: ${gameId} was created!`)
}

// removes a game with the specified id
async function removeGame(gameId) {
    // remove game from game
    await db.run(`DELETE FROM game WHERE gameId=?`, [gameId])
    // remove game from board
    await db.run(`DELETE FROM board WHERE gameId=?`, [gameId])
    console.log(`Game: ${gameId} was deleted!`)
}

// creates a new player for a game
// returns the playerId
async function createPlayer(gameId, playerId) {
    // create game if it doesn't exist
    var game = await getGameInfo(gameId)
    if(game == undefined) {
        await createGame(gameId)
    }

    // check if should use ghost
    var ghostId;
    var board = await getGameBoard(gameId)
    for(player of board) {
        if(player.player < 0) {
            // use ghost
            ghostId = player.player
            break
        }
    }

    if(ghostId < 0) {
        // assign ghost to player
        await db.run(`UPDATE board SET player = ? WHERE player = ? AND gameId = ?`, [playerId, ghostId, gameId])
    } else {
        // get other players and decide color
        var playerColor = board.length;

        // add new player to the board
        await db.run(`INSERT INTO board (gameId, player, color) VALUES (?, ?, ?)`, [gameId, playerId, playerColor])
    }

    
    console.log(`Player ${playerId} joined game ${gameId}!`)
    return playerId
}

// deletes a player
async function removePlayer(playerId) {
    console.log(`Player ${playerId} left the game!`)

    // get game which the player was playing
    var gameId = await db.get('SELECT gameId FROM board WHERE player = ?', [playerId])?.gameId
    var lastGhostId = -1
    if(gameId) {
        // check if game should now be removed
        var boardInfo = await getGameBoard(gameId)
        var players = 0
        for(player of boardInfo) {
            if(player.player > -1) {
                players++
            } else if (player.player < lastGhostId) {
                lastGhostId = player.player
            }
        }
        lastGhostId -= 1
        if(players <= 1) {
            // remove the empty game
            await removeGame(gameId)
        }
    }

    // change player into ghost
    await db.run(`UPDATE board SET player = ? WHERE player=?`, [lastGhostId, playerId])
}


// count the number of spaces a pawn has moved from
// its starting position till the current position
function countMoves(color, position) {
    if(position == -1) return 0
    var moves = 0
    if(position < START_POSITIONS[color]) {
        moves = position
        moves += 52 - START_POSITIONS[color]
    } else if (position < 52) {
        moves = position - START_POSITIONS[color]
    } else {
        // safe zone
        moves = 50 + position - SAFE_ZONE_START_POSITIONS[color]
    }
    return moves
}

// transform relative number of moves to
// the absolute pawn position
function movesToAbsolute(color, moves) {
    if(moves == 0) return -1
    if (moves < 51) {
        // regular position
        return (START_POSITIONS[color] + moves) % 52
    } else {
        return SAFE_ZONE_START_POSITIONS[color] + (moves - 51)
    }
}

// performs a dice roll for a player
async function doDiceRoll(gameId, playerId) {
    // do dice roll
    var roll = 1 + Math.round(Math.random() * 5)
    console.log(`Dice roll: ${roll}`)

    // get game information
    var gameInfo = await getGameInfo(gameId)
    var board = await getGameBoard(gameId)
    var playerInfo;
    for(player of board) {
        if(player.player == playerId) {
            playerInfo = player;
            break;
        }
    }

    // reset consecutive sixes
    if(roll != 6) {
        // reset consecutive sixes
        await db.run('UPDATE game SET consecutiveSixes = ? WHERE gameId = ?', [0, gameId])
    }

    // check if any moves can be made
    var movesAvailable = false
    if(roll > 0) {
        for(let i = 0; i < 4; i++) {
            if(canDoMove(board, playerInfo, playerInfo[`p${i}`], roll) == true) {
                movesAvailable = true
            }
        }
    }
    if(movesAvailable == true) {
        // sixes rule
        if(roll == 6 
            && (playerInfo.p0 > -1 && playerInfo.p1 > -1 && playerInfo.p2 > -1 && playerInfo.p3 > -1)
            && gameInfo.consecutiveSixes == 2) {
            // skip player move
            roll = 0
        } else {
            // increase player's "balance"
            await increasePlayerBalance(gameId, playerId, roll)
        }
    } else {
        await skipPlayerMove(gameInfo, playerId)
        roll = 0 // roll 0 = skip
    }

    // dice roll event
    gameEvent.emit('diceRoll', gameId, playerId, roll)

    return roll
}

// skips a player's move
async function skipPlayerMove(gameInfo, playerId) {
    // reset balance
    await db.run('UPDATE board SET balance = ? WHERE gameId = ? AND player = ?', [0, gameInfo.gameId, playerId])

    // skip move
    await db.run('UPDATE game SET moves = ? WHERE gameId = ?', [gameInfo.moves + 1, gameInfo.gameId])
}

// increases a given player's balance
async function increasePlayerBalance(gameId, playerId, balance) {
    await db.run('UPDATE board SET balance = ? WHERE gameId = ? AND player = ?', [balance, gameId, playerId])
}

// performs a pawn move for a player
async function doPawnMove(gameId, playerId, pawn, spaces) {
    // get game information
    var gameInfo = await getGameInfo(gameId)
    var board = await getGameBoard(gameId)
    var playerInfo;
    for(player of board) {
        if(player.player == playerId) {
            playerInfo = player;
            break;
        }
    }
    var pawnPosition = playerInfo[`p${pawn}`]

    // update pawn's position
    if(pawnPosition == -1) {
        // pawn didn't start yet
        if(spaces == 6) {
            // start pawn
            playerInfo[`p${pawn}`] = START_POSITIONS[playerInfo.color]

            // check murder
            var murderInfo = checkPawnMurder(board, playerId, START_POSITIONS[playerInfo.color], 0)
            if(murderInfo != undefined) {
                // murdering a pawn
                await doPawnMurder(gameId, murderInfo, playerInfo)
            }
        } else {
            // not enough power
            console.log('Cant move, not enough power')
            return false;
        }
    } else {
        // check if we can move
        if(canDoMove(board, playerInfo, pawnPosition, spaces) == false) {
            return false;
        }

        // sixes rule
        if(spaces == 6 
            && (playerInfo.p0 > -1 && playerInfo.p1 > -1 && playerInfo.p2 > -1 && playerInfo.p3 > -1)) {
            // update sixes stats
            await db.run('UPDATE game SET sixes = ?, consecutiveSixes = ? WHERE gameId = ?', [gameInfo.sixes + 1, gameInfo.consecutiveSixes + 1, gameId])
        }

        // check safe zone
        var posFromStartAfterMove = countMoves(playerInfo.color, pawnPosition) + spaces
        if(posFromStartAfterMove > 50) {
            // safe zone
            // check goal
            if(posFromStartAfterMove == 55) {
                // player wins
                console.log(`Player ${playerInfo.player} won the game: ${gameInfo.gameId}`)

                // event
                gameEvent.emit('playerWin', gameId, playerId, playerInfo.color)
            } else if(posFromStartAfterMove > 55) {
                // overshoot, go back to start
                posFromStartAfterMove = 0
            }
        } else {
            // regular zone
            // check murder
            var murderInfo = checkPawnMurder(board, playerId, pawnPosition, spaces)
            if(murderInfo != undefined) {
                await doPawnMurder(gameId, murderInfo, playerInfo)
            }
        }

        // circular movement
        playerInfo[`p${pawn}`] = movesToAbsolute(playerInfo.color, posFromStartAfterMove)
    }
    // update pawn position
    await db.run(`UPDATE board SET p${pawn} = ? WHERE gameId = ? AND player = ?`, [playerInfo[`p${pawn}`], gameId, playerId])
    
    // reset balance
    await db.run('UPDATE board SET balance = ? WHERE gameId = ? AND player = ?', [0, gameId, playerId])

    // skip move
    await db.run('UPDATE game SET moves = ? WHERE gameId = ?', [gameInfo.moves + 1, gameId])

    // dice roll event
    gameEvent.emit('pawnMove', gameId, playerId, playerInfo.color, pawn, playerInfo[`p${pawn}`])

    return true
}

// does a pawn murder
async function doPawnMurder(gameId, murderInfo, playerInfo) {
    // murdering a pawn
    await db.run(`UPDATE board SET p${murderInfo.pawn} = ? WHERE gameId = ? AND player = ?`, [-1, gameId, murderInfo.playerId])

    // murder event
    var playerBInfo = await getGameBoardPlayer(gameId, murderInfo.playerId)
    gameEvent.emit('pawnMurder', gameId, playerInfo.player, playerInfo.color, playerBInfo.color)
}

// check if a player can do a specific move on the board
function canDoMove(board, playerInfo, pawnPosition, spaces) {
    // check if pawn deployed
    if(pawnPosition == -1 && spaces != 6) {
        return false
    }

    // get pawn position from start
    var posFromStart = countMoves(playerInfo.color, pawnPosition)
    var otherCollisionCheck = Math.max((50 - posFromStart), 0)
    var selfCollisionCheck = spaces - otherCollisionCheck
    
    // check collsions with others
    if(checkPawnCollisions(board, playerInfo.player, pawnPosition, Math.min(spaces, otherCollisionCheck)) == true) {
        console.log('Cant move, other pawn collision')
        return false
    }

    // check collisions with self
    if(checkPawnCollisionsWithSelf(board, playerInfo, posFromStart, selfCollisionCheck) == true) {
        console.log('Cant move, self pawn collision')
        return false
    }

    return true
}

// checks whether moving a pawn from position a to b causes a collision
function checkPawnCollisions(board, playerId, position, spaces) {
    if(spaces == 0) return false
    if(position == -1) {
        return false
    }
    var endPos = (position + spaces) % 52
    for(player of board) {
        if(player.player == playerId) continue
        for(let i = 0; i < 4; i++) {
            var p = player[`p${i}`]
            if(p == -1) continue
            if(p > 51) continue
            if(endPos > position) {
                if(p > position && p < endPos) {
                    // collision imminent
                    console.log(`Pawn ${position} will collide with ${p} over ${spaces} moves`)
                    return true
                }
            } else {
                if(p < endPos || p > position) {
                    // collision imminent
                    console.log(`Pawn ${position} will collide with ${p} over ${spaces} moves`)
                    return true
                }
            }
        }
    }
    return false
}

// checks whether moving a pawn from position a to b causes a collision
function checkPawnCollisionsWithSelf(board, playerInfo, position, spaces) {
    if(spaces == 0) return false
    var endPos = position + spaces
    for(let i = 0; i < 4; i++) {
        var p = countMoves(playerInfo.color, playerInfo[`p${i}`])
        if(p > position && p < endPos) {
            // collision imminent
            return true
        }
    }
    return false
}

// checks whether moving a pawn from position a to b will murder
function checkPawnMurder(board, playerId, position, spaces) {
    var endPos = (position + spaces) % 52
    for(player of board) {
        if(player.player == playerId) continue
        for(let i = 0; i < 4; i++) {
            var p = player[`p${i}`]
            if(p == endPos) {
                // murder confirmed
                return {
                    playerId: player.player,
                    pawn: i
                }
            }
        }
    }
    return undefined
}

// set up game routes
router.get('/', async (req, res) => {
    // return list of all ongoing games
    try {
        res.send(await db.all(`SELECT gameId, COUNT(player) AS players FROM board WHERE player > -1 GROUP BY gameId`))
    } catch (err) {
        console.error('Error getting list of games!', err)
        res.status(500)
        res.send('Error getting list of games!')
    }
})
router.get('/:id', async (req, res) => {
    // return info about a specific game
    try {
        var info = await getGameInfo(req.params.id)
        var board = await getGameBoard(req.params.id)
        for(player of board) {
            player.player = undefined // obscure player id
        }
        res.send({
            info,
            board
        })
    } catch (err) {
        res.status(500)
        res.send('Error getting game info!')
        console.error('Error gettimng game info!', err)
    }
})
router.ws('/:id/live', async (ws, req) => {
    /// EVENTS \\\
    // nickname change event
    var nicknameChangedListener = (gameId, pId) => {
        if(req.params.id == gameId) {
            if (ws.readyState === 1) {
                ws.send(`UPDATE_PLAYERS`)
            }
        }
    }
    playerManager.nicknameChanged.addListener('nicknameChanged', nicknameChangedListener)
    // dice event
    var diceEventListener = (gameId, pId, roll) => {
        if(req.params.id == gameId) {
            ws.send(`DICE_ROLL ${pId} ${roll}`)
        }
    }
    gameEvent.addListener('diceRoll', diceEventListener)
    // dice event
    var pawnEventListener = (gameId, pId, color, pawn, position) => {
        if(req.params.id == gameId) {
            ws.send(`PAWN_MOVE ${color} ${pawn} ${position}`)
        }
    }
    gameEvent.addListener('pawnMove', pawnEventListener)
    // victory event
    var victoryEventListener = async (gameId, pId, color) => {
        if(req.params.id == gameId) {
            var nickname = await playerManager.getNickname(pId)
            ws.close(1000, `${nickname} (${BOARD_COLORS[color]}) won the game.\nWell played!`)
        }
    }
    gameEvent.addListener('playerWin', victoryEventListener)
    // murder event
    var murderEventListener = async (gameId, pId, color, color1) => {
        if(req.params.id == gameId) {
            ws.send(`MURDER ${color} ${color1}`)
        }
    }
    gameEvent.addListener('pawnMurder', murderEventListener)

    // remove player on disconnection
    ws.on('close', (code, reason) => {
        // events
        playerManager.nicknameChanged.removeListener('nicknameChanged', nicknameChangedListener)
        gameEvent.removeListener('diceRoll', diceEventListener)
        gameEvent.removeListener('pawnMove', pawnEventListener)
        gameEvent.removeListener('playerWin', victoryEventListener)
        gameEvent.removeListener('pawnMurder', murderEventListener)
        
        // rest
        playerManager.removeNickname(ws._socket.remotePort)
        removePlayer(ws._socket.remotePort)
    })

    // check number of people in game
    var board = await getGameBoard(req.params.id)
    if(board.length > 3) {
        // check if there are ghosts
        var ghost = false
        for(player of board) {
            if(player.player < 0) {
                ghost = true
                break
            }
        }
        if(ghost == false) {
            ws.close(1000, 'Game full!')
        }
    }

    // create game entry for player
    var playerId = await createPlayer(req.params.id, ws._socket.remotePort)

    // create nickname entry for player
    await playerManager.createNickname(req.params.id, playerId, 'Anonymous')

    // send ready signal to player
    if (ws.readyState === 1) {
        ws.send(`PLAYER_ID ${playerId}`)
    }
})
router.post('/:id/roll', async (req, res) => {
    // do a dice roll for a player
    // get player
    var playerId = req.body.playerId;
    if(!playerId) {
        res.status(400)
        res.send('Invalid player id')
        return
    }

    // get board info
    var game = await getGameInfo(req.params.id)
    var board = await getGameBoard(req.params.id)
    if(board == undefined || game == undefined) {
        res.status(404)
        res.send('Game doesnt exist!')
        return
    }

    // check if game is started
    if(board.length < 4) {
        res.status(401)
        res.send('Game hasnt started yet!')
        return
    }

    // get player info from board
    var playerInfo;
    for(player of board) {
        if(player.player == playerId) {
            playerInfo = player;
            break;
        }
    }
    if(playerInfo == undefined) {
        res.status(401)
        res.send('Player not in game!')
        console.log('Player not in game!')
        return
    }

    // make sure there are no duplicate rolls
    if(playerInfo.balance > 0) {
        res.status(401)
        res.send('You already rolled!')
        console.log('You already rolled!')
        return
    }

    // check if this is player's turn
    if((game.start_color + game.moves - game.sixes) % 4 == playerInfo.color) {
        // send back the rolled number
        try {
            var roll = await doDiceRoll(req.params.id, playerId)
            res.send({
                roll
            })
        } catch(err) {
            res.status(500)
            res.send('Error doing dice roll!')
            console.error('Error doing dice roll!', err)
        }
    } else {
        // not your turn
        res.status(401)
        res.send('Not your turn!')
        console.log(`Not your turn! It's ${(game.start_color + game.moves - game.sixes) % 4}'s turn, and you're ${playerInfo.color}`)
    }
})
router.post('/:id/move', async (req, res) => {
    // do a move for a player

    // get player id and pawn number
    var playerId = req.body.playerId
    var pawn = req.body.pawn
    if(playerId == undefined || pawn == undefined) {
        res.status(400)
        res.send('Invalid request')
        return
    }

    // get board info
    var board = await getGameBoard(req.params.id)
    if(board == undefined) {
        res.status(404)
        res.send('Game doesnt exist!')
        return
    }

    // check if game is started
    if(board.length < 4) {
        res.status(401)
        res.send('Game hasnt started yet!')
        return
    }

    // get player info from board
    var playerInfo
    for(player of board) {
        if(player.player == playerId) {
            playerInfo = player;
            break;
        }
    }
    if(playerInfo == undefined) {
        res.status(401)
        res.send('Player not in game!')
        console.log('Player not in game!')
        return
    }

    // check player balance
    if(playerInfo.balance < 1) {
        res.status(401)
        res.send('Not your turn!')
        console.log('Not your turn!')
        return
    }

    // do move
    try {
        var success = await doPawnMove(req.params.id, playerId, pawn, playerInfo.balance)
        res.send({success})
    } catch(err) {
        res.status(500)
        res.send('Error doing dice roll!')
        console.error('Error doing dice roll!', err)
    }
})
router.post('/:id/color', async (req, res) => {
    // return info about a player's color
    try {
        var playerInfo = await getGameBoardPlayer(req.params.id, req.body.playerId)
        res.send({
            color: playerInfo.color
        })
    } catch (err) {
        res.status(500)
        res.send('Error getting player color!')
        console.error('Error gettimng player color!', err)
    }
})
router.post('/', async (req, res) => {
    // check request
    if(req.body.quickGame == undefined) {
        res.status(400)
        res.send('Invalid request')
        return
    }

    // check if quickgame
    if(req.body.quickGame == true) {
        // find open games
        var game = await db.get('SELECT gameId, COUNT(player) AS players FROM board WHERE player > -1 GROUP BY gameId HAVING players < 4 ORDER BY players DESC LIMIT 1')
        if(game != undefined) {
            res.send({gameId: game.gameId})
            return
        }
    }

    // generate a new game id
    var gameId = generateUniqueGameId()
    res.send({gameId})
})

// player subsection
router.use('/:id/player', playerManager.router)

// initialize database
initDB()

// export router
module.exports = router