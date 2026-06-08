'use client';

import React, { useState, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Clipboard, Download, MessageCircle, Share2 } from 'lucide-react';

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
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] md:grid-cols-2 md:grid-rows-1">
      <div className="flex min-h-0 items-center justify-center bg-black p-4 md:h-full md:p-6">
        <div className="flex h-full max-h-full w-full max-w-full items-center justify-center overflow-hidden rounded-[5px] bg-black">
          {isGenerating || !imageUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
              <span className="text-sm text-white/70">Generating share card...</span>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt="Quiz Results Share Card"
              className="h-full w-full object-contain"
            />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-y-auto p-5 md:p-8">
        <div className="pr-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Share result</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {result.score}/{result.maxScore} points
          </h2>
          <p className="mt-1 text-lg font-semibold text-primary">{result.percentage.toFixed(1)}%</p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Share this generated result card, download it as an image, or copy the caption for posting elsewhere.
          </p>
        </div>

        <div className="mt-6 space-y-3 rounded-[5px] bg-[#edf4ff] p-4 dark:bg-muted/60">
          <div>
            <p className="text-xs text-muted-foreground">Quiz</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{result.quiz.title}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Course</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {result.quiz.courseCode}{result.quiz.courseTitle ? ` - ${result.quiz.courseTitle}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="grid gap-3">
            <button
              onClick={downloadImage}
              disabled={!imageUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download image
            </button>
            <button
              onClick={shareToWhatsApp}
              disabled={!imageUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              Share to WhatsApp
            </button>
            <button
              onClick={copyShareText}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Clipboard className="h-4 w-4" />
              {copied ? 'Copied' : 'Copy caption'}
            </button>
            {onShare && imageUrl && (
              <button
                onClick={() => onShare(imageUrl)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[5px] border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <Share2 className="h-4 w-4" />
                Share image
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSS animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
