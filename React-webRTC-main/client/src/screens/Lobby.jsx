import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";

const LobbyScreen = () => {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [showInputs, setShowInputs] = useState(false);

  const socket = useSocket();
  const navigate = useNavigate();

  const handleSubmitForm = useCallback(
    (e) => {
      e.preventDefault();
      socket.emit("room:join", { name, room });
    },
    [name, room, socket]
  );

  const handleJoinRoom = useCallback(
    (data) => {
      const { room } = data;
      navigate(`/room/${room}`);
    },
    [navigate]
  );

  useEffect(() => {
    socket.on("room:join", handleJoinRoom);
    return () => {
      socket.off("room:join", handleJoinRoom);
    };
  }, [socket, handleJoinRoom]);

  const handleButtonClick = () => {
    setShowInputs(true); // Show input fields
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Column */}
          <div className="p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Meeting Options
            </h2>
            <p className="text-gray-600 mb-6">
              Choose an option to get started with your meeting.
            </p>

            {!showInputs && ( // Show buttons only when input fields are hidden
              <div className="flex space-x-4 mb-6">
                <button
                  onClick={handleButtonClick}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600"
                >
                  Create a Meeting
                </button>
                <button
                  onClick={handleButtonClick}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  Join a Meeting
                </button>
              </div>
            )}

            {showInputs && (
              <form onSubmit={handleSubmitForm} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full mt-1 p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Room Number
                  </label>
                  <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="Enter room number"
                    className="w-full mt-1 p-2 border rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-green-500 text-white px-4 py-2 mt-4 rounded-lg hover:bg-green-600"
                >
                  Submit
                </button>
              </form>
            )}
          </div>

          {/* Right Column */}
          <div className="p-8 flex items-center justify-center bg-blue-50">
            <img
              src="https://via.placeholder.com/300"
              alt="Meeting Illustration"
              className="w-full max-w-sm rounded-lg shadow-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyScreen;
