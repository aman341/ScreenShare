import React, { useEffect, useCallback, useState } from "react";
import ReactPlayer from "react-player";
import peer from "../service/peer";
import { useSocket } from "../context/SocketProvider";

const RoomPage = () => {
  const socket = useSocket();
  const [remoteSocketId, setRemoteSocketId] = useState(null);
  const [myStream, setMyStream] = useState();
  const [remoteStream, setRemoteStream] = useState();
  const [screenStream, setScreenStream] = useState(null);
  const [cameraOn, setCameraOn] = useState(true); // Track if the camera is on for the user
  const [micMuted, setMicMuted] = useState(false); // Track if the mic is muted
  const [streamSent, setStreamSent] = useState(false); // Track if stream has been sent
  const [callInitiated, setCallInitiated] = useState(false); // New state variable

  const handleUserJoined = useCallback(({ email, id }) => {
    console.log(`Email ${email} joined room`);
    setRemoteSocketId(id);
  }, []);

  const handleCallUser = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    const offer = await peer.getOffer();
    socket.emit("user:call", { to: remoteSocketId, offer });
    setMyStream(stream);
    setCallInitiated(true);
  }, [remoteSocketId, socket]);

  const handleIncommingCall = useCallback(
    async ({ from, offer }) => {
      setRemoteSocketId(from);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      setMyStream(stream);
      console.log(`Incoming Call`, from, offer);
      const ans = await peer.getAnswer(offer);
      socket.emit("call:accepted", { to: from, ans });
    },
    [socket]
  );

  const sendStreams = useCallback(() => {
    const streamToSend = screenStream || myStream; // Use screen stream if available
    if (streamToSend) {
      for (const track of streamToSend.getTracks()) {
        peer.peer.addTrack(track, streamToSend);
      }
      socket.emit("screen:share", { screenStream: streamToSend });
      setCallInitiated(true);
      setStreamSent(true); // Hide the button after stream is sent
    }
  }, [myStream, screenStream, socket]);

  const handleCallAccepted = useCallback(
    ({ from, ans }) => {
      peer.setLocalDescription(ans);
      console.log("Call Accepted!");
      sendStreams();
    },
    [sendStreams]
  );

  const handleNegoNeeded = useCallback(async () => {
    const offer = await peer.getOffer();
    socket.emit("peer:nego:needed", { offer, to: remoteSocketId });
  }, [remoteSocketId, socket]);

  useEffect(() => {
    peer.peer.addEventListener("negotiationneeded", handleNegoNeeded);
    return () => {
      peer.peer.removeEventListener("negotiationneeded", handleNegoNeeded);
    };
  }, [handleNegoNeeded]);

  const handleNegoNeedIncomming = useCallback(
    async ({ from, offer }) => {
      const ans = await peer.getAnswer(offer);
      socket.emit("peer:nego:done", { to: from, ans });
    },
    [socket]
  );

  const handleNegoNeedFinal = useCallback(async ({ ans }) => {
    await peer.setLocalDescription(ans);
  }, []);

  useEffect(() => {
    peer.peer.addEventListener("track", async (ev) => {
      const [stream] = ev.streams;
      setRemoteStream(stream);
    });
  }, []);

  useEffect(() => {
    socket.on("user:joined", handleUserJoined);
    socket.on("incomming:call", handleIncommingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("peer:nego:needed", handleNegoNeedIncomming);
    socket.on("peer:nego:final", handleNegoNeedFinal);
    socket.on("screen:shared", (stream) => {
      setRemoteStream(stream);
    });
    socket.on("camera:toggled", (cameraState) => {
      setCameraOn(cameraState);
    });

    socket.on("user:left", (email) => {
      alert(`${email} has left the meeting!`);
    });

    return () => {
      socket.off("user:joined", handleUserJoined);
      socket.off("incomming:call", handleIncommingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("peer:nego:needed", handleNegoNeedIncomming);
      socket.off("peer:nego:final", handleNegoNeedFinal);
      socket.off("screen:shared");
      socket.off("camera:toggled");
      socket.off("user:left");
    };
  }, [
    socket,
    handleUserJoined,
    handleIncommingCall,
    handleCallAccepted,
    handleNegoNeedIncomming,
    handleNegoNeedFinal,
  ]);

  const handleScreenShare = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(screen);

      // Replace the video track in the peer connection
      const videoTrack = screen.getVideoTracks()[0];
      const senders = peer.peer.getSenders();
      const videoSender = senders.find((sender) => sender.track?.kind === "video");

      if (videoSender) {
        await videoSender.replaceTrack(videoTrack);
      } else {
        // Add the new track if no video sender exists
        for (const track of screen.getTracks()) {
          peer.peer.addTrack(track, screen);
        }
      }

      socket.emit("screen:share", { from: "User" });

      // Stop screen sharing when the user stops the screen stream
      screen.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error("Error sharing screen:", error);
    }
  }, [socket]);

  const stopScreenShare = useCallback(async () => {
    if (screenStream) {
      const senders = peer.peer.getSenders();
      const videoSender = senders.find((sender) => sender.track?.kind === "video");

      // Revert to the original video stream (camera)
      if (myStream && videoSender) {
        const cameraTrack = myStream.getVideoTracks()[0];
        await videoSender.replaceTrack(cameraTrack);
      }

      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      socket.emit("screen:stop", { from: "User" });
    }
  }, [myStream, screenStream, socket]);

  const toggleCamera = useCallback(() => {
    if (myStream) {
      const videoTrack = myStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraOn(videoTrack.enabled);
        socket.emit("camera:toggled", videoTrack.enabled);
      }
    }
  }, [myStream, socket]);

  const toggleMic = useCallback(() => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicMuted(!audioTrack.enabled);
      }
    }
  }, [myStream]);

  const leaveMeeting = () => {
    socket.emit("user:left", { email: "User" }); // Send user leave notification
    // Stop all streams and disconnect
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    socket.emit("user:left", { email: "User" });
    alert("You have left the meeting.");
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <h1>Room Page</h1>
      <h4>{remoteSocketId ? "Connected" : "No one in room"}</h4>

      {/* Conditionally render video streams */}
      {myStream && !screenStream && (
        <>
          <h1>My Stream</h1>
          <ReactPlayer playing muted={false} height="100px" width="200px" url={myStream} />
        </>
      )}

      {screenStream && (
        <>
          <h1>Screen Share (Local)</h1>
          <ReactPlayer playing muted={false} height="100px" width="200px" url={screenStream} />
        </>
      )}

      {remoteStream && (
        <>
          <h1>Remote Stream</h1>
          <ReactPlayer playing muted={false} height="100px" width="200px" url={remoteStream} />
        </>
      )}

      {/* Buttons at the bottom */}
      <div style={{ position: "absolute", bottom: "20px", width: "100%", textAlign: "center" }}>
        {remoteSocketId && !myStream && <button onClick={handleCallUser}>CALL</button>}
        {remoteSocketId && myStream && !streamSent && <button onClick={sendStreams}>Send Stream</button>}

        {myStream && (
          <>
            <button onClick={toggleCamera}>{cameraOn ? "Turn Camera Off" : "Turn Camera On"}</button>
            <button onClick={toggleMic}>{micMuted ? "Unmute Mic" : "Mute Mic"}</button>
          </>
        )}

        {callInitiated && !screenStream && <button onClick={handleScreenShare}>Share Screen</button>}
        {screenStream && <button onClick={stopScreenShare}>Stop Sharing</button>}
        {remoteSocketId && <button onClick={leaveMeeting}>Leave Meeting</button>}
      </div>
    </div>
  );
};

export default RoomPage;
