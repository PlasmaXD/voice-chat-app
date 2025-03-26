// app/call/components/VoiceCall.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';

const SIGNALING_SEND_URL = '/api/signaling/send';
const SIGNALING_RECEIVE_URL = '/api/signaling/receive';

export default function VoiceCall() {
  const [ownClientId, setOwnClientId] = useState('');
  const [peerClientId, setPeerClientId] = useState('');
  const [isCallStarted, setIsCallStarted] = useState(false);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // 保留中のICE候補を一時保持するためのref
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([]);

  // シグナリングメッセージ送信用ヘルパー
  async function sendSignal(event: string, data: any) {
    if (!peerClientId) {
      console.error('Peer Client ID is required');
      return;
    }
    await fetch(SIGNALING_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        data,
        targetId: peerClientId,
      }),
    });
  }

  // シグナリングメッセージ受信用ポーリング
  async function pollSignals() {
    if (!ownClientId) return;
    try {
      const res = await fetch(`${SIGNALING_RECEIVE_URL}?clientId=${ownClientId}`);
      const json = await res.json();
      const messages = json.messages;
      messages.forEach((msg: any) => {
        handleSignal(msg);
      });
    } catch (err) {
      console.error('Error polling signals', err);
    }
  }

  // 保留中のICE候補をflushするヘルパー
  async function flushPendingCandidates(pc: RTCPeerConnection) {
    if (pendingCandidatesRef.current.length > 0) {
      console.log("Flushing pending ICE candidates:", pendingCandidatesRef.current);
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err: any) {
          if (err.message && err.message.includes("Unknown ufrag")) {
            console.warn("Ignoring ICE candidate with unknown ufrag:", err);
          } else {
            console.error("Error adding buffered ICE candidate", err);
          }
        }
      }
      pendingCandidatesRef.current = [];
    }
  }

  // 受信シグナルの処理
  async function handleSignal(message: any) {
    const { event, data } = message;
    console.log('Received signal:', event, data);
    const pc = pcRef.current;
    if (!pc) return;

    if (event === 'offer') {
      // 相手からのOfferを受信
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      // リモート記述設定後、保留中のICE候補をflush
      await flushPendingCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // Answerを返す
      sendSignal('answer', answer);
    } else if (event === 'answer') {
      // 自分のOfferに対するAnswerを受信
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        await flushPendingCandidates(pc);
      } else {
        console.warn("Remote description already set. Ignoring duplicate answer.");
      }
    } else if (event === 'ice-candidate') {
      // ICE Candidateを受信
      const candidate = new RTCIceCandidate(data);
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err: any) {
          if (err.message && err.message.includes("Unknown ufrag")) {
            console.warn("Ignoring ICE candidate with unknown ufrag:", err);
          } else {
            console.error('Error adding ICE candidate', err);
          }
        }
      } else {
        console.log("Buffering ICE candidate until remote description is set.");
        pendingCandidatesRef.current.push(candidate);
      }
    }
  }

  // 通話開始
  async function startCall() {
    if (!ownClientId || !peerClientId) {
      alert('Both your Client ID and Peer Client ID are required');
      return;
    }
    try {
      // マイク音声取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
        localAudioRef.current.play().catch(err => console.error("Local play failed:", err));
      }
      // PeerConnectionの作成
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // 自分の音声トラックを追加
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // ICE Candidateイベント
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal('ice-candidate', event.candidate);
        }
      };

      // ontrackイベント (相手からの音声を受信)
      pc.ontrack = (event) => {
        console.log("ontrack event fired", event);
        const [remoteStream] = event.streams;
        const remoteAudio = document.getElementById('remoteAudio') as HTMLAudioElement;
        if (remoteAudio) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.play().catch(err => console.error("Remote play failed:", err));
        }
      };

      // 接続状態の監視
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state changed:", pc.iceConnectionState);
      };
      pc.onconnectionstatechange = () => {
        console.log("Connection state changed:", pc.connectionState);
      };

      // 自分がCallを開始する場合、Offer作成・送信
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('offer', offer);

      setIsCallStarted(true);
    } catch (err) {
      console.error('Error starting call', err);
    }
  }

  // 通話終了
  function endCall() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setIsCallStarted(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // 保留中の候補もクリア
    pendingCandidatesRef.current = [];
  }

  // ポーリング開始（通話中かつownClientIdが設定済みなら毎秒実行）
  useEffect(() => {
    if (ownClientId && isCallStarted && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(pollSignals, 1000);
    }
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [ownClientId, isCallStarted]);

  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="mr-2">
          Your Client ID:
          <input
            type="text"
            value={ownClientId}
            onChange={(e) => setOwnClientId(e.target.value)}
            className="border p-1 ml-2"
          />
        </label>
      </div>
      <div className="mb-4">
        <label className="mr-2">
          Peer Client ID:
          <input
            type="text"
            value={peerClientId}
            onChange={(e) => setPeerClientId(e.target.value)}
            className="border p-1 ml-2"
          />
        </label>
      </div>
      <div className="mb-4">
        {!isCallStarted ? (
          <button
            onClick={startCall}
            className="bg-blue-500 text-white p-2 rounded"
          >
            Start Call
          </button>
        ) : (
          <button
            onClick={endCall}
            className="bg-red-500 text-white p-2 rounded"
          >
            End Call
          </button>
        )}
      </div>
      <div className="mb-4">
        <h3 className="font-semibold">Local Audio</h3>
        <audio ref={localAudioRef} controls muted />
      </div>
      <div>
        <h3 className="font-semibold">Remote Audio</h3>
        <audio id="remoteAudio" controls />
      </div>
    </div>
  );
}
