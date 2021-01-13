var express = require('express')
var router = express.Router()

// get player manager
const playerManager = require('../player/player')

// get database
const db = require('../index').db

// board class
// stores board info per player
class Board {
    constructor(gameId, playerId, p1, p2, p3, p4) {
      this.gameId = gameId;
      this.playerId = playerId;
      this.p1 = p1;
      this.p2 = p2;
      this.p3 = p3;
      this.p4 = p4;
    }
  }

// initializes the game database
function initDB() {
    // prepare the game database
    db.prepare(`CREATE TABLE IF NOT EXISTS board (game varchar(5), player int, p1 int, p2 int, p3 int, p4 int)`).run().finalize()
}

// generates a unique game id
function generateUniqueGameId(callback) {
    // generates a 5 digit game id
    var gameId = (Math.random() * 100000).toString()
    // pad with zeroes
    return gameId.padStart(5, '0')
}

// creates a new player for a game
// returns the playerId
function createPlayer(gameId, playerId, callback) {
    // add player to game and to connections
    db.run(`INSERT INTO board (game, player) VALUES (?, ?)`, [gameId, playerId], (err) => {
        if(err) console.error('Couldnt create a new player!', err)
        console.log(`Player ${playerId} joined game ${gameId}!`)
        callback(playerId)
    })
}

// deletes a player
function removePlayer(playerId) {
    console.log(`Player ${playerId} left the game!`)
    db.run(`DELETE FROM board WHERE player=?`, [playerId], (err) => {
        if(err) console.error('Couldnt remove player!', err)
    })
}

// set up game routes
router.get('/', (req, res) => {
    // return list of all ongoing games
    db.all(`SELECT game, COUNT(player) AS players FROM board GROUP BY game`, (err, rows) => {
        if(err) console.error('Error getting list of games!', err)
        res.send({'games': rows})
    })
})
router.get('/:id', (req, res) => {
    // return info about game with specific id
    db.all(`SELECT player, p1, p2, p3, p4 FROM board WHERE game = ?`, [req.params.id], (err, rows) => {
        if(err) console.error('Error getting game info!', err)
        res.send({'players': rows})
    })
})
router.ws('/:id/live', (ws, req) => {
    // create nickname entry for player
    playerManager.createNickname(ws._socket.remotePort, 'Anonymous', (nickname) => {
        // create game entry for player
        createPlayer(req.params.id, ws._socket.remotePort, (playerId) => {
            // send ready signal to player
            ws.send(`PLAYER_ID ${playerId}`)
        })
    })

    // remove player on disconnection
    ws.on('close', (code, reason) => {
        removePlayer(ws._socket.remotePort)
        playerManager.removeNickname(ws._socket.remotePort)
    })
})
router.post('/:id/roll', (req, res) => {
    // rolls a dice for a specific player
    res.send({roll: 1 + Math.round(Math.random() * 5)})
})
router.post('/', (req, res) => {
    // generate a game id
    generateUniqueGameId((gameId) => {
        console.log(`New game: ${gameId} was created!`)
        res.send({'gameId': gameId})
    })
})

// initialize database
initDB()

// export router
module.exports = router