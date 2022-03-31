const port = process.env.PORT || 3000 // need this
const hostname = "192.168.0.12" //"localhost" //"192.168.0.9"

const express = require("express")
const webSocket = require("websocket")
const https = require("https")
const fs = require("fs")

const key = fs.readFileSync("./cert/CA/localhost/localhost.decrypted.key")
const cert = fs.readFileSync("./cert/CA/localhost/localhost.crt")
const app = express()
const WebSocketServer = webSocket.server

let user = 0
// serving
app.use("/", express.static("public"))
// route /
app.use((req, res, next) => {
  console.log("Receive request from: ", req.socket.remoteAddress)
  next()
})
app.get("/", (req, res) => {
  res.send("WEBSOCKET SERVER")
})
// ---- HTTPS server
// const server = https.createServer({ key, cert }, app)

// server.listen(port, hostname, () => {
//   const host = server.address().address
//   console.log(`App listening on https://${host}:${port}`)
// })

// ---- HTTP server

const server = app.listen(port, () => {
  const host = server.address().address
  console.log(`App listening on http://${host}:${port}`)
})

let _connectionList = []
let _nextID = 0

const wsServer = new WebSocketServer({
  httpServer: server,
})
wsServer.on("request", (req) => {
  const origin = req.origin + req.resource
  const connection = req.accept(null, origin)

  _connectionList.push(connection)
  console.log(new Date(), "Connection from origin", origin, "ID:", _nextID)
  connection.clientID = _nextID++

  const res = {
    type: "id",
    id: connection.clientID,
  }
  connection.sendUTF(JSON.stringify(res))
  connection.sendUTF(
    JSON.stringify({
      type: "update-user-list",
      users: _connectionList
        .filter(({ clientID }) => clientID !== connection.clientID)
        .map((c) => c.clientID),
    })
  )
  _connectionList.forEach((c) => {
    if (c.clientID !== connection.clientID)
      c.sendUTF(
        JSON.stringify({
          type: "update-user-list",
          users: [connection.clientID],
        })
      )
  })

  connection.on("message", (message) => {
    if (message.type === "utf8") {
      handleEvent(JSON.parse(message.utf8Data), connection)
    }
  })
  connection.on("close", () => {
    console.log("Client ID:", connection.clientID, "closed")
    _connectionList = _connectionList.filter(
      ({ clientID }) => clientID !== connection.clientID
    )
    _connectionList.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "remove-user",
          id: connection.clientID,
        })
      )
    })
  })
})
const sendToUser = (targetID, msg) => {
  msg = JSON.stringify(msg)
  for (let i = 0; i < _connectionList.length; i++) {
    if (_connectionList[i].clientID === targetID) {
      _connectionList[i].sendUTF(msg)
      return true
    }
  }
  return false
}
const getConnection = (id) => {
  return _connectionList.find((connection) => connection.clientID === id)
}
const handleEvent = (message, connection) => {
  const { type, ...data } = message
  // console.log({ type, from: connection.clientID, to: data.target })
  switch (type) {
    case "call-user": {
      const msg = {
        type: "incoming-call",
        from: connection.clientID,
      }
      sendToUser(data.target, msg)
      break
    }
    case "reject-call": {
      const msg = {
        type: "call-rejected",
        from: connection.clientID,
      }
      sendToUser(data.target, msg)
      break
    }
    case "accept-call": {
      const msg = {
        type: "call-accepted",
        sdp: data.sdp,
        from: connection.clientID,
      }
      sendToUser(data.target, msg)
      break
    }
    case "send-caller-sdp": {
      const msg = {
        type: "caller-sdp-incoming",
        sdp: data.sdp,
        from: connection.clientID,
      }
      sendToUser(data.target, msg)
      break
    }
    case "new-ice-candidate": {
      const msg = {
        type: "new-ice-candidate",
        candidate: data.candidate,
        from: connection.clientID,
      }
      sendToUser(data.target, msg)
      break
    }
    default:
      break
  }
}
