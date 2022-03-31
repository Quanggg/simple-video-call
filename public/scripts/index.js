// WebSocket
const SIGNALING_SERVER = "wss://quang-simple-video-call.herokuapp.com:443/"

window.WebSocket = window.WebSocket || window.MozWebSocket
const wsConnection = new WebSocket(SIGNALING_SERVER, "json")

const signaler = {
  send: (payload) => {
    console.log("Sending:", { type: payload.type, to: payload.target })
    wsConnection.send(JSON.stringify(payload))
  },
}

wsConnection.onmessage = (message) => {
  const data = JSON.parse(message.data)
  console.log("Received:", data)
  handleMessage(data)
}
// WebRTC
let clientID
let targetID = null
const { RTCPeerConnection, RTCSessionDescription } = window
const peerConnection = new RTCPeerConnection()

peerConnection.ontrack = ({ track, streams }) => {
  track.onunmute = () => {
    const remoteVideo = document.getElementById("remote-video")
    if (remoteVideo) {
      remoteVideo.srcObject = streams[0]
    }
  }
}

peerConnection.onicecandidate = (e) => {
  if (e.candidate && targetID !== null)
    signaler.send({
      type: "new-ice-candidate",
      candidate: e.candidate,
      target: targetID,
    })
}

const handleMessage = async (data) => {
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
        return signaler.send({
          type: "reject-call",
          target: data.from,
        })
      // accept call
      targetID = data.from
      await peerConnection.setLocalDescription()
      signaler.send({
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
      signaler.send({
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
// front-end
const initLocalMedia = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })

    for (const track of stream.getTracks())
      peerConnection.addTrack(track, stream)

    const localVideo = document.getElementById("local-video")
    if (localVideo) localVideo.srcObject = stream
  } catch (error) {
    console.error(error)
  }
}
initLocalMedia()
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
    // call-user
    signaler.send({
      type: "call-user",
      target: userID,
    })
  })

  return userContainerEl
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
