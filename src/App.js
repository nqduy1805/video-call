import React, { useRef, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
const origin = " https://2475-113-161-41-179.ngrok-free.app";

const socket = io(origin); // Kết nối đến server signaling

function App() {
    const localVideo = useRef(null);
    const remoteVideo = useRef(null);
    const peerConnection = useRef(null);
    const [userId, setUserId] = useState('');
    const [connectedUser, setConnectedUser] = useState('');

    useEffect(() => {
        // Kết nối WebRTC
        peerConnection.current = new RTCPeerConnection();

        // Lấy stream từ camera/micro
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: true })
            .then((stream) => {
                localVideo.current.srcObject = stream;
                stream.getTracks().forEach((track) => {
                    peerConnection.current.addTrack(track, stream);
                });
            });

        // Khi nhận stream từ peer khác
        peerConnection.current.ontrack = (event) => {
            remoteVideo.current.srcObject = event.streams[0];
        };

        // Xử lý sự kiện từ signaling server
        socket.on('signal', async ({ from, signal }) => {
            console.log(`Received signal from ${from}:`, signal);
            if (signal.type === 'offer') {
                await peerConnection.current.setRemoteDescription(signal);
                const answer = await peerConnection.current.createAnswer();
                await peerConnection.current.setLocalDescription(answer);
                socket.emit('signal', {
                    to: from,
                    from: userId,
                    signal: peerConnection.current.localDescription,
                });
            } else if (signal.type === 'answer') {
                await peerConnection.current.setRemoteDescription(signal);
            } else if (signal.candidate) {
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
    }, [userId, connectedUser]);

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
            <button onClick={startCall} disabled={!connectedUser}>
                Start Call
            </button>
            <p>Your ID: {userId}</p>
            <p>Connected User: {connectedUser || 'Waiting for another user...'}</p>
        </div>
    );
}

export default App;
