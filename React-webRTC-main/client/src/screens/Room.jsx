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
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      setScreenStream(screen);

      // Replace the video track in the peer connection
      const videoTrack = screen.getVideoTracks()[0];
      const senders = peer.peer.getSenders();
      const videoSender = senders.find(
        (sender) => sender.track?.kind === "video"
      );

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
      const videoSender = senders.find(
        (sender) => sender.track?.kind === "video"
      );

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
      myStream.getTracks().forEach((track) => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }
    socket.emit("user:left", { email: "User" });
    alert("You have left the meeting.");
  };

  return (
    <div className="flex flex-col items-center justify-between">
      {/* Header */}
      <div className="flex flex-col items-center justify-center min-h-screen ">
        <h1 className="text-4xl font-bold mb-4">Room Page</h1>
        <h4 className="text-lg font-semibold text-center p-4">
          {remoteSocketId ? "Connected" : "No one in room"}
        </h4>
      </div>

      {/* Video streams */}
      <div className="absolute w-full h-full">
        {/* Remote Stream - Full screen with border radius */}
        {remoteStream && (
          <div className="w-full h-full absolute rounded-lg overflow-hidden">
            <h1 className="text-black p-2 text-3xl transform font-bold">
              Remote Stream
            </h1>
            <ReactPlayer
              playing
              muted={false}
              height="100%"
              width="100%"
              style={{ borderRadius: "0.5rem" }}
              url={remoteStream}
            />
          </div>
        )}

        {/* My Stream - Small video at top-right */}
        {myStream && !screenStream && (
          <div className="absolute top-4 right-4 z-20">
            <h1 className="text-white text-xl">My Stream</h1>
            <ReactPlayer
              playing
              muted={false}
              height="120px"
              width="200px"
              url={myStream}
            />
          </div>
        )}

        {/* Screen Stream - Small video at top-right */}
        {screenStream && (
          <div className="absolute top-4 right-4 z-20">
            <h1 className="text-white text-xl">Screen Share (Local)</h1>
            <ReactPlayer
              playing
              muted={false}
              height="120px"
              width="200px"
              url={screenStream}
            />
          </div>
        )}
      </div>

      {/* Buttons at the bottom */}
      <div className="flex justify-center items-center w-full py-4 space-x-4 fixed bottom-0 left-0 z-30">
        {remoteSocketId && !myStream && (
          <button
            type="button"
            onClick={handleCallUser}
            className="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5"
          >
            Start Meeting
          </button>
        )}
        {remoteSocketId && myStream && !streamSent && (
          <button
            onClick={sendStreams}
            className="bg-blue-500 text-white rounded-lg px-5 py-2.5"
          >
            Send Stream
          </button>
        )}
        {myStream && (
          <>
           <button
  onClick={toggleCamera}
  className="bg-black text-white rounded-full w-16 h-16 flex items-center justify-center"
>
  {/* Conditionally render icons */}
  {cameraOn ? (
   <svg class="h-8 w-8 text-zinc-100"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round">  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />  <circle cx="12" cy="13" r="4" /></svg>
  ) : (
    <svg
      className="h-8 w-8 text-red-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
    </svg>
  )}
</button>


<button
  onClick={toggleMic}
  className="bg-red-500 text-white rounded-full w-16 h-16 flex items-center justify-center"
>
  {/* Conditionally render mic icons */}
  {micMuted ? (
     <svg class="h-8 w-8 text-zinc-100"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round">  <line x1="1" y1="1" x2="23" y2="23" />  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />  <line x1="12" y1="19" x2="12" y2="23" />  <line x1="8" y1="23" x2="16" y2="23" /></svg>

  ) : (
    <svg class="h-8 w-8 text-zinc-100"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round">  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />  <line x1="12" y1="19" x2="12" y2="23" />  <line x1="8" y1="23" x2="16" y2="23" /></svg>
  )}
</button>

          </>
        )}
        {callInitiated && !screenStream && (
 <button
 onClick={handleScreenShare}
 className="bg-blue-500 text-white rounded-full w-16 h-16 flex items-center justify-center"
>
 {/* Share Screen Icon */}
 <svg class="h-8 w-8 text-zinc-100"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round">  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />  <polyline points="16 6 12 2 8 6" />  <line x1="12" y1="2" x2="12" y2="15" /></svg>
</button>
        )}
        {screenStream && (
          <button
          onClick={stopScreenShare}
          className="bg-blue-500 text-white rounded-full w-16 h-16 flex items-center justify-center"
        >
          {/* Stop Sharing Icon */}
          <svg class="h-8 w-8 text-zinc-100"  width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">  <path stroke="none" d="M0 0h24v24H0z"/>  <path d="M8 13.5v-8a1.5 1.5 0 0 1 3 0v6.5m0 -6.5v-2a1.5 1.5 0 0 1 3 0v8.5m0 -6.5a1.5 1.5 0 0 1 3 0v6.5m0 -4.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2a7 6 0 0 1 -5 -3l-2.7 -5.25a1.4 1.4 0 0 1 2.75 -2l.9 1.75" /></svg>
        </button>
        )}
        {remoteSocketId && (
          <button
            type="button"
            onClick={leaveMeeting}
            className="bg-red-700 text-white rounded-full w-16 h-16 flex items-center justify-center"
          >
            <svg class="h-8 w-8 text-zinc-100"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round">  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />  <line x1="23" y1="1" x2="1" y2="23" /></svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default RoomPage;
