var express = require('express')
var router = express.Router({mergeParams: true})

const db = require('../../index').db

// nickname change event emitter
const EventEmitter = require('events');
const nicknameChanged = new EventEmitter()

// initializes the game database
async function initDB() {
    // prepare the nicknames database
    await db.run(`CREATE TABLE IF NOT EXISTS nicknames (player INTEGER NOT NULL PRIMARY KEY, nickname varchar(15))`)
}

// gets a nickname from db
async function getNickname(playerId) {
    return (await db.get('SELECT nickname FROM nicknames WHERE player = ?', [playerId]))?.nickname
}

// creates a nickname in db
async function createNickname(gameId, playerId, nickname) {
    await db.run(`INSERT INTO nicknames (player, nickname) VALUES (?, ?)`, [playerId, nickname])
    nicknameChanged.emit('nicknameChanged', gameId, playerId)
    return nickname
}

// updates a nickname
async function updateNickname(gameId, playerId, nickname) {
    await db.run(`UPDATE nicknames SET nickname = ? WHERE player = ?`, [nickname, playerId])
    nicknameChanged.emit('nicknameChanged', gameId, playerId)
}

// removes a nickname from db
async function removeNickname(playerId) {
    var gameId = (await db.get('SELECT gameId FROM board WHERE player = ?', [playerId]))?.gameId
    await db.run(`DELETE FROM nicknames WHERE player=?`, [playerId])
    nicknameChanged.emit('nicknameChanged', gameId, playerId)
}

// get all player's nicknames
router.get('/nicknames', async (req, res) => {
    var names = []
    var players = await db.all('SELECT player FROM board WHERE gameId = ?', [req.params.id])

    for(let i = 0; i < 4; i++) {
        if(players.length < i + 1) {
            // placeholder
            names.push(null)
        } else {
            // check ghost
            if(players[i].player < 0) {
                // ghost
                names.push(null)
            } else {
                // real
                names.push(await getNickname(players[i].player))
            }
        }
    }
    res.send(names)
})
// get player's nickname
router.get('/:playerId/nickname', async (req, res) => {
    try {
        var nickname = await getNickname(req.params.playerId)
        if(nickname == undefined) {
            res.status(404)
            res.send({'error': 'Nickname not set'})
        } else {
            res.send({'nickname': nickname})
        }
    } catch (err) {
        res.status(500)
        res.send('Error fetching nickname')
    }
})
// update own nickname
router.put('/:playerId/nickname', async (req, res) => {
    if(req.body.nickname) {
        // update existing nickname
        try {
            await updateNickname(req.params.id, req.params.playerId, req.body.nickname)
            res.send({})
        } catch (err) {
            console.error('Error updating player nickname!', err)
            res.status(500)
            res.send({error: 'Database error'})
        }
    } else {
        res.status(400)
        res.send('Invalid request')
    }
})

// init nickname db
initDB()

module.exports.router = router
module.exports.nicknameChanged = nicknameChanged
module.exports.removeNickname = removeNickname
module.exports.createNickname = createNickname
module.exports.getNickname = getNickname