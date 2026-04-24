'use client';

import React, { useRef, useState, useEffect } from 'react';
import html2canvas from 'html2canvas';

interface QuizShareCardProps {
  result: {
    score: number;
    maxScore: number;
    percentage: number;
    timeTaken?: number;
    completedAt: string;
    quiz: {
      title: string;
      courseCode: string;
      courseTitle: string;
      topic?: string;
    };
  };
  onShare?: (imageUrl: string) => void;
}

// ── The actual card layout (only rendered off-screen for capture) ──
function ShareCardCanvas({ result }: { result: QuizShareCardProps['result'] }) {
  const getScoreMessage = (percentage: number) => {
    if (percentage >= 90) return '🔥 Outstanding Performance!';
    if (percentage >= 80) return '🔥 Distinction Level!';
    if (percentage >= 70) return '✅ Great Job!';
    if (percentage >= 60) return '⚠️ You\'re almost there!';
    if (percentage >= 50) return '📚 Keep studying!';
    return '💪 Don\'t give up!';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} min ${secs} sec`;
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch { return 'N/A'; }
  };

  return (
    <div style={{
      width: 1000, height: 1000,
      background: 'linear-gradient(135deg, #14532d 0%, #000000 50%, #111827 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      position: 'relative', overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      margin: 0, padding: 0, borderRadius: 0, boxShadow: 'none',
    }}>
      {/* Background Blurs */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: 32, right: 32, width: 160, height: 160, background: '#22c55e', borderRadius: '50%', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: 32, left: 32, width: 128, height: 128, background: '#3b82f6', borderRadius: '50%', filter: 'blur(40px)' }} />
      </div>

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', marginTop: 64, marginBottom: 32, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 160, height: 160, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/uploads/Logo.png" alt="PANSGPT Logo" width={160} height={160} style={{ objectFit: 'contain' }} />
        </div>
        <p style={{ color: '#86efac', fontSize: 24, fontWeight: 600, margin: 0 }}>Quiz Results</p>
      </div>

      {/* Score */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', marginBottom: 32, width: '100%' }}>
        <div style={{ fontSize: 72, fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
          {result.score}/{result.maxScore}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>
          {result.percentage.toFixed(1)}%
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: '#86efac' }}>
          {getScoreMessage(result.percentage)}
        </div>
      </div>

      {/* Quiz Info */}
      <div style={{ position: 'relative', zIndex: 10, width: '80%', margin: '0 auto', marginBottom: 32 }}>
        <div style={{ background: 'rgba(20, 83, 45, 0.3)', borderRadius: 12, padding: 32, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
          <h3 style={{ fontSize: 24, fontWeight: 700, color: '#ffffff', marginBottom: 8, marginTop: 0 }}>
            {result.quiz.title}
          </h3>
          <p style={{ color: '#86efac', fontSize: 18, margin: 0 }}>
            {result.quiz.courseCode} - {result.quiz.courseTitle}
          </p>
          {result.quiz.topic && (
            <p style={{ color: '#d1d5db', fontSize: 18, marginTop: 8, marginBottom: 0 }}>
              Topic: {result.quiz.topic}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, color: '#d1d5db', marginTop: 16 }}>
          {result.timeTaken && <span>⏱️ {formatTime(result.timeTaken)}</span>}
          <span>📅 {formatDate(result.completedAt)}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', marginBottom: 48, width: '100%' }}>
        <div style={{ fontSize: 18, color: '#9ca3af', marginBottom: 8 }}>Powered by PANSGPT</div>
        <div style={{ fontSize: 18, color: '#4ade80', fontWeight: 600 }}>Your AI Study Partner</div>
      </div>

      {/* Decorative */}
      <div style={{ position: 'absolute', bottom: 32, right: 32, width: 64, height: 64, background: 'rgba(34, 197, 94, 0.2)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', top: '50%', left: 32, width: 32, height: 32, background: 'rgba(59, 130, 246, 0.2)', borderRadius: '50%' }} />
    </div>
  );
}


// ── Main component: generates image and shows it as preview ──
export default function QuizShareCard({ result, onShare }: QuizShareCardProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const getShareText = () => {
    const getMsg = (p: number) => {
      if (p >= 90) return '🔥 Outstanding Performance!';
      if (p >= 80) return '🔥 Distinction Level!';
      if (p >= 70) return '✅ Great Job!';
      if (p >= 60) return '⚠️ You\'re almost there!';
      if (p >= 50) return '📚 Keep studying!';
      return '💪 Don\'t give up!';
    };
    return `${result.score}/${result.maxScore} in ${result.quiz.courseCode} – thanks to PANSGPT! 🎯\n\n${getMsg(result.percentage)}\n\nYou know the best thing to do 📚`;
  };

  // Generate the image on mount
  useEffect(() => {
    generateImage();
  }, []);

  const generateImage = async () => {
    setIsGenerating(true);
    try {
      // Create hidden container
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.zIndex = '-1';
      document.body.appendChild(container);

      // Render the canvas card
      const { createRoot } = await import('react-dom/client');
      const root = createRoot(container);
      root.render(<ShareCardCanvas result={result} />);

      // Wait for render + image load
      await new Promise(resolve => setTimeout(resolve, 500));

      const cardNode = container.firstChild as HTMLElement;
      if (!cardNode) throw new Error('Failed to render card');

      const canvas = await html2canvas(cardNode, {
        backgroundColor: '#000000',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 1000,
        height: 1000,
      });

      const url = canvas.toDataURL('image/png');
      setImageUrl(url);

      root.unmount();
      document.body.removeChild(container);
    } catch (error) {
      console.error('Failed to generate share card image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.download = `pansgpt-quiz-result-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
  };

  const shareToWhatsApp = async () => {
    if (!imageUrl) {
      await generateImage();
      if (!imageUrl) return;
    }

    try {
      // Convert to File
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'pansgpt-quiz-result.png', { type: 'image/png' });

      // Try Web Share API (mobile — opens native share sheet with image)
      if (navigator.share && navigator.canShare) {
        const shareData: ShareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
            return;
          } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.log('Web Share API failed, trying fallback');
          }
        }
      }

      // Desktop fallback: download + open WhatsApp Web
      const link = document.createElement('a');
      link.download = 'pansgpt-quiz-result.png';
      link.href = imageUrl;
      link.click();

      const shareText = encodeURIComponent(getShareText());
      window.open(`https://wa.me/?text=${shareText}`, '_blank');

    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Image Preview */}
      <div style={{
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {isGenerating || !imageUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(34, 197, 94, 0.3)',
              borderTopColor: '#22c55e',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Generating share card...</span>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt="Quiz Results Share Card"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={downloadImage}
          disabled={!imageUrl}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px 24px',
            background: !imageUrl ? '#166534' : '#16a34a',
            color: '#ffffff', borderRadius: 8, fontWeight: 500,
            border: 'none', cursor: !imageUrl ? 'not-allowed' : 'pointer',
            opacity: !imageUrl ? 0.5 : 1, fontSize: 14,
          }}
        >
          📷 Download Image
        </button>

        <button
          onClick={shareToWhatsApp}
          disabled={!imageUrl}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px 24px',
            background: !imageUrl ? '#166534' : '#22c55e',
            color: '#ffffff', borderRadius: 8, fontWeight: 500,
            border: 'none', cursor: !imageUrl ? 'not-allowed' : 'pointer',
            opacity: !imageUrl ? 0.5 : 1, fontSize: 14,
          }}
        >
          📱 Share to WhatsApp
        </button>

        <button
          onClick={copyShareText}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px 24px',
            background: '#2563eb',
            color: '#ffffff', borderRadius: 8, fontWeight: 500,
            border: 'none', cursor: 'pointer', fontSize: 14,
          }}
        >
          {copied ? '✅ Copied!' : '📋 Copy Text'}
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: 14, color: '#9ca3af', marginTop: 8 }}>
        💡 Tip: Download or share your results card!
      </div>

      {/* CSS animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
