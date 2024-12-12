import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const origin = "https://2475-113-161-41-179.ngrok-free.app";  // Thay bằng ngrok hoặc URL backend của bạn
const socket = io(origin);  // Kết nối đến server signaling

function App() {
    const localVideo = useRef(null);
    const remoteVideo = useRef(null);
    const peerConnection = useRef(null);
    const [userId, setUserId] = useState('');
    const [connectedUser, setConnectedUser] = useState('');
    const [roomId, setRoomId] = useState('');

    useEffect(() => {
        // Kết nối WebRTC
        peerConnection.current = new RTCPeerConnection();

        // Lấy stream từ camera/micro
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                localVideo.current.srcObject = stream;
                stream.getTracks().forEach((track) => {
                    peerConnection.current.addTrack(track, stream); // Thêm track vào peer connection
                });
            })
            .catch((error) => {
                console.error('Error accessing media devices:', error);
            });

        // Khi nhận stream từ peer khác
        peerConnection.current.ontrack = (event) => {
            console.log('Received track:', event);

            remoteVideo.current.srcObject = event.streams[0];
        };

        // Xử lý sự kiện từ signaling server
        socket.on('signal', async ({ from, signal }) => {
            console.log(`Received signal from ${from}:`, signal);
        
            if (signal.type === 'offer') {
                // Kiểm tra trạng thái của peerConnection
                if (peerConnection.current.signalingState === 'stable') {
                    console.log("Cannot set local description in the 'stable' state");
                    return;  // Không thiết lập local description nếu đang ở trạng thái stable
                }
        
                // Thiết lập remote description với offer nhận được
                await peerConnection.current.setRemoteDescription(signal);
        
                // Tạo answer và thiết lập local description
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);  // Gọi setLocalDescription để thiết lập answer
        
                // Gửi answer tới peer
                socket.emit('signal', {
                    to: from,
                    from: userId,
                    signal: peerConnection.current.localDescription,
                });
            } else if (signal.type === 'answer') {
                // Kiểm tra và xử lý answer khi peer connection đang ở trạng thái hợp lý
                if (peerConnection.current.signalingState === 'stable') {
                    console.log("Answer received but peer connection is already in stable state.");
                    return;  // Tránh gọi setLocalDescription khi ở trạng thái stable
                }
                
                // Thiết lập remote description với answer nhận được
                await peerConnection.current.setRemoteDescription(signal);
            } else if (signal.candidate) {
                // Xử lý ICE candidate
                if (!peerConnection.current.remoteDescription) {
                    console.log("Cannot add ICE candidate, remote description is null");
                    return;  // Không thêm ICE candidate nếu remote description chưa được thiết lập
                }
                await peerConnection.current.addIceCandidate(signal.candidate);
            }
        });
        

        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', {
                    to: connectedUser,
                    from: userId,
                    signal: { candidate: event.candidate },
                });
            }
        };

        socket.on('connect', () => {
            setUserId(socket.id);
        });

        socket.on('user-joined', (id) => {
            console.log(`User joined: ${id}`);
            setConnectedUser(id);
        });

        // Khi người dùng rời khỏi phòng
        socket.on('user-disconnected', (id) => {
            console.log(`User disconnected: ${id}`);
            if (connectedUser === id) {
                setConnectedUser('');
            }
        });
    }, [userId, connectedUser]);

    // Join room function
    const joinRoom = (room) => {
        setRoomId(room);
        socket.emit('join-room', room);  // Tham gia phòng
    };

    const startCall = async () => {

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('signal', {
            to: connectedUser,
            from: userId,
            signal: peerConnection.current.localDescription,
        });
    };

    return (
        <div>
            <div>
                <video ref={localVideo} autoPlay muted style={{ width: '45%' }} />
                <video ref={remoteVideo} autoPlay style={{ width: '45%' }} />
            </div>
            <input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
            />
            <button onClick={() => joinRoom(roomId)}>Join Room</button>
            <button onClick={startCall} disabled={!connectedUser}>
                Start Call
            </button>
            <p>Your ID: {userId}</p>
            <p>Connected User: {connectedUser || 'Waiting for another user...'}</p>
        </div>
    );
}

export default App;
