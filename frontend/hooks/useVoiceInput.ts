import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';

type VoiceEngine = 'groq' | 'browser';
type RecognitionResultItem = { transcript?: string };
type RecognitionResult = { isFinal?: boolean; 0?: RecognitionResultItem };
type RecognitionEvent = { resultIndex: number; results: RecognitionResult[] };
type RecognitionErrorEvent = { error?: string };
type RecognitionInstance = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: RecognitionErrorEvent) => void) | null;
    start: () => void;
    stop: () => void;
};
type SpeechRecognitionConstructor = new () => RecognitionInstance;

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
        webkitAudioContext?: typeof AudioContext;
    }
}

export function useVoiceInput() {
    const [engine, setEngine] = useState<VoiceEngine>('groq');
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [volume, setVolume] = useState(0);

    const recognitionRef = useRef<RecognitionInstance | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<number | null>(null);
    const startingTimeoutRef = useRef<number | null>(null);

    // Audio Visualization Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Resilience Refs
    const recordingStartTimeRef = useRef<number>(0);
    const isAborted = useRef(false);
    const isUnmounting = useRef(false);

    const browserSupported = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    }, []);

    const recorderSupported =
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof MediaRecorder !== 'undefined';

    const cleanupAudioContext = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        setVolume(0);
    }, []);

    const cleanupStream = useCallback(() => {
        cleanupAudioContext();
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
    }, [cleanupAudioContext]);

    const clearTimer = useCallback(() => {
        if (timerIntervalRef.current !== null) {
            window.clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    const clearStartingTimeout = useCallback(() => {
        if (startingTimeoutRef.current !== null) {
            window.clearTimeout(startingTimeoutRef.current);
            startingTimeoutRef.current = null;
        }
    }, []);

    const visualizeAudio = useCallback(() => {
        if (!analyserRef.current) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateVolume = () => {
            if (!analyserRef.current) return;

            analyserRef.current.getByteFrequencyData(dataArray);

            // Calculate average volume
            let sum = 0;
            // We only need a subset of the frequency data for voice
            const length = dataArray.length;
            for (let i = 0; i < length; i++) {
                sum += dataArray[i];
            }
            const average = sum / length;

            // Normalize to 0-100 (approximate)
            // Audio data is 0-255, but usually voice doesn't hit max often
            const normalizedVolume = Math.min(100, (average / 128) * 100);

            setVolume(normalizedVolume);
            animationFrameRef.current = requestAnimationFrame(updateVolume);
        };

        updateVolume();
    }, []);

    const setupAudioAnalysis = useCallback((stream: MediaStream) => {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            const audioContext = new AudioContextClass();
            audioContextRef.current = audioContext;

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            sourceRef.current = source;
            source.connect(analyser);

            visualizeAudio();
        } catch (error) {
            console.error('Failed to setup audio analysis:', error);
        }
    }, [visualizeAudio]);

    useEffect(() => {
        if (!browserSupported) return;
        const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Ctor) return;

        const recognition = new Ctor();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = (event: RecognitionEvent) => {
            let finalChunk = '';
            let interimChunk = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0]?.transcript ?? '';
                if (event.results[i].isFinal) {
                    finalChunk += text;
                } else {
                    interimChunk += text;
                }
            }
            if (finalChunk) {
                setTranscript(prev => `${prev}${finalChunk}`);
            }
            setInterimTranscript(interimChunk);
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.onstart = null;
            recognition.onend = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.stop();
            recognitionRef.current = null;
        };
    }, [browserSupported]);

    const isSilenceHallucination = useCallback((text: string) => {
        const normalized = text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .trim()
            .replace(/\s+/g, ' ');
        return normalized === 'bye' || normalized === 'goodbye';
    }, []);

    const startListening = useCallback(async () => {
        setIsStarting(true);
        clearStartingTimeout();
        startingTimeoutRef.current = window.setTimeout(() => {
            setIsStarting(false);
            startingTimeoutRef.current = null;
        }, 1000);

        setRecordingTime(0);
        setInterimTranscript('');
        setVolume(0);

        if (engine === 'groq') {
            if (!recorderSupported) {
                if (browserSupported) {
                    setEngine('browser');
                    toast('Server busy, switching to local voice recognition');
                }
                clearStartingTimeout();
                setIsStarting(false);
                return;
            }

            try {
                let mimeType = '';
                if (MediaRecorder.isTypeSupported('audio/webm')) {
                    mimeType = 'audio/webm';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;

                // Setup Visualization
                setupAudioAnalysis(stream);

                const options = mimeType ? { mimeType } : {};
                const recorder = new MediaRecorder(stream, options);
                mediaRecorderRef.current = recorder;

                recorder.ondataavailable = (event: BlobEvent) => {
                    if (event.data.size > 0) {
                        audioChunks.current.push(event.data);
                    }
                };

                recorder.onstop = async () => {
                    const elapsed = Date.now() - recordingStartTimeRef.current;
                    if (isUnmounting.current) {
                        audioChunks.current = [];
                        cleanupStream();
                        setIsProcessing(false);
                        setIsListening(false);
                        return;
                    }
                    if (elapsed < 1000) {
                        console.warn(`Recording discarded: too short (${elapsed}ms)`);
                        audioChunks.current = [];
                        cleanupStream();
                        setIsProcessing(false);
                        setIsListening(false);
                        return;
                    }

                    if (isAborted.current) {
                        isAborted.current = false;
                        audioChunks.current = [];
                        cleanupStream();
                        setIsProcessing(false);
                        setIsListening(false);
                        return;
                    }

                    const blob = new Blob(audioChunks.current, {
                        type: mediaRecorderRef.current?.mimeType || recorder.mimeType,
                    });

                    if (blob.size === 0 || audioChunks.current.length === 0) {
                        console.error('Recording failed: Empty blob');
                        setIsProcessing(false);
                        setIsListening(false);
                        audioChunks.current = [];
                        cleanupStream();
                        return;
                    }

                    audioChunks.current = [];
                    cleanupStream();
                    setIsListening(false);
                    setIsProcessing(true);
                    try {
                        const formData = new FormData();
                        formData.append('audio', blob, 'recording.webm');
                        const response = await api.fetch('/transcribe', {
                            method: 'POST',
                            body: formData,
                        });

                        if (response.status === 429) {
                            let payload: Record<string, unknown> = {};
                            try {
                                payload = await response.json();
                            } catch {
                                payload = {};
                            }
                            if (payload?.error === 'groq_limits_reached') {
                                setEngine('browser');
                                toast('Server busy, switching to local voice recognition');
                                return;
                            }
                        }

                        if (!response.ok) {
                            throw new Error(`Groq transcription failed (${response.status})`);
                        }

                        const payload = await response.json();
                        const text = String(payload?.text || '').trim();
                        if (text && !isSilenceHallucination(text)) {
                            setTranscript(prev => `${prev}${text}`);
                            setInterimTranscript('');
                        }
                    } catch (error) {
                        console.error('Groq voice transcription failed:', error);
                    } finally {
                        setIsProcessing(false);
                        setIsListening(false);
                    }
                };

                audioChunks.current = [];
                isAborted.current = false;
                isUnmounting.current = false;
                recorder.start();

                // Resilience: Mark start time
                recordingStartTimeRef.current = Date.now();

                clearStartingTimeout();
                setIsStarting(false);
                setIsListening(true);
            } catch (error) {
                audioChunks.current = [];
                cleanupStream();
                setIsListening(false);
                setIsStarting(false);
                clearStartingTimeout();
                console.error('Audio recording failed:', error);
            }
            return;
        }

        if (!browserSupported || !recognitionRef.current) {
            return;
        }
        try {
            recognitionRef.current.start();
        } catch {
            // no-op on repeated starts
        }
    }, [browserSupported, cleanupStream, clearStartingTimeout, engine, isSilenceHallucination, recorderSupported, setupAudioAnalysis]);

    const stopListening = useCallback(() => {
        clearStartingTimeout();
        setIsStarting(false);
        if (engine === 'groq') {
            if (mediaRecorderRef.current && isListening) {
                const elapsed = Date.now() - recordingStartTimeRef.current;
                if (elapsed < 1000) {
                    isAborted.current = true;
                    mediaRecorderRef.current.stop();
                    setIsListening(false);
                    setIsProcessing(false);
                    clearTimer();
                    setRecordingTime(0);
                    return;
                }

                setIsListening(false);
                setIsProcessing(true);
                mediaRecorderRef.current.stop();
            } else {
                cleanupStream();
                setIsListening(false);
            }
            clearTimer();
            setRecordingTime(0);
            return;
        }
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        clearTimer();
        setRecordingTime(0);
    }, [cleanupStream, clearStartingTimeout, clearTimer, engine, isListening]);

    const resetTranscript = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
    }, []);

    useEffect(() => {
        clearTimer();
        if (isListening) {
            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        }
        return () => {
            clearTimer();
        };
    }, [clearTimer, isListening]);

    useEffect(() => {
        return () => {
            isUnmounting.current = true;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            clearTimer();
            clearStartingTimeout();
            cleanupStream();
        };
    }, [cleanupStream, clearStartingTimeout, clearTimer]);

    return {
        engine,
        isListening,
        isStarting,
        isProcessing,
        recordingTime,
        transcript,
        interimTranscript,
        volume,
        startListening,
        stopListening,
        resetTranscript,
    };
}
