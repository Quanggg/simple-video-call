// front-end
function unselectUsersFromList() {
  const alreadySelectedUser = document.querySelectorAll(
    ".active-user.active-user--selected"
  )

  alreadySelectedUser.forEach((el) => {
    el.setAttribute("class", "active-user")
  })
}

function createUserItemContainer(userID) {
  const userContainerEl = document.createElement("div")

  const usernameEl = document.createElement("p")

  userContainerEl.setAttribute("class", "active-user")
  userContainerEl.setAttribute("id", userID)
  usernameEl.setAttribute("class", "username")
  usernameEl.innerHTML = `Socket: ${userID}`

  userContainerEl.appendChild(usernameEl)

  userContainerEl.addEventListener("click", () => {
    unselectUsersFromList()
    userContainerEl.setAttribute("class", "active-user active-user--selected")
    const talkingWithInfo = document.getElementById("talking-with-info")
    talkingWithInfo.innerHTML = `Talking with: "Socket: ${userID}"`
    callUser(userID)
  })

  return userContainerEl
}

//
let clientID
let isAlreadyCalling = false
let getCalled = false

const SIGNALING_SERVER = "wss://192.168.1.46:3000/"

const { RTCPeerConnection, RTCSessionDescription } = window
const peerConnection = new RTCPeerConnection()
let dataChannel
let targetID = null

window.WebSocket = window.WebSocket || window.MozWebSocket
const connection = new WebSocket(SIGNALING_SERVER, "json")

const mySend = (payload) => {
  console.log("Sending:", { type: payload.type, to: payload.target })
  connection.send(JSON.stringify(payload))
}
const callUser = (userID) => {
  mySend({
    type: "call-user",
    target: userID,
  })
}
const signaler = {
  send: (payload) => {
    console.log("Sending:", { type: payload.type, to: payload.target })
    connection.send(JSON.stringify(payload))
  },
}

function updateUserList(userList) {
  const activeUserContainer = document.getElementById("active-user-container")

  userList.forEach((userID) => {
    const alreadyExistingUser = document.getElementById(userID)
    if (!alreadyExistingUser) {
      const userContainerEl = createUserItemContainer(userID)

      activeUserContainer.appendChild(userContainerEl)
    }
  })
}
connection.onmessage = async (message) => {
  const data = JSON.parse(message.data)
  console.log("Received:", data)

  switch (data.type) {
    case "id":
      clientID = data.id
      break
    case "update-user-list": {
      updateUserList(data.users)
      break
    }
    case "remove-user": {
      const elToRemove = document.getElementById(data.id)
      if (elToRemove) elToRemove.remove()
      break
    }
    case "incoming-call": {
      const confirmed = confirm(
        `UserID: ${data.from} want to call you. Do you accept this call?`
      )
      if (!confirmed)
        return mySend({
          type: "reject-call",
          target: data.from,
        })
      // accept call
      targetID = data.from
      await peerConnection.setLocalDescription()
      mySend({
        type: "accept-call",
        sdp: peerConnection.localDescription,
        target: data.from,
      })
      break
    }
    case "call-rejected": {
      alert(`UserID: ${data.from} rejected your call`)
      break
    }
    case "call-accepted": {
      targetID = data.from
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      )
      await peerConnection.setLocalDescription()
      mySend({
        type: "send-caller-sdp",
        sdp: peerConnection.localDescription,
        target: data.from,
      })
      break
    }
    case "caller-sdp-incoming": {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      )
      break
    }
    case "new-ice-candidate": {
      try {
        await peerConnection.addIceCandidate(data.candidate)
      } catch (error) {
        console.error(error)
      }
      break
    }
    default:
      break
  }
}

peerConnection.ontrack = function ({ streams: [stream] }) {
  const remoteVideo = document.getElementById("remote-video")
  if (remoteVideo) {
    remoteVideo.srcObject = stream
  }
}

navigator.getUserMedia(
  { video: true, audio: true },
  (stream) => {
    const localVideo = document.getElementById("local-video")
    if (localVideo) {
      localVideo.srcObject = stream
    }

    stream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, stream))
  },
  (error) => {
    console.warn(error.message)
  }
)

peerConnection.onicecandidate = (e) => {
  if (e.candidate && targetID !== null)
    mySend({
      type: "new-ice-candidate",
      candidate: e.candidate,
      target: targetID,
    })
}
