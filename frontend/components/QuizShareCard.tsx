'use client';

import React, { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';

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
  exportMode?: boolean;
}

export default function QuizShareCard({ result, onShare, exportMode = false }: QuizShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);

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
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getShareText = () => {
    const timeText = result.timeTaken ? ` in ${formatTime(result.timeTaken)}` : '';
    return `${result.score}/${result.maxScore} in ${result.quiz.courseCode} – thanks to PANSGPT! 🎯\n\n${getScoreMessage(result.percentage)}\n\nYou know the best thing to do 📚`;
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const generateShareImage = async () => {
    setIsGenerating(true);
    // Create a hidden export-mode card in the DOM
    const exportDiv = document.createElement('div');
    exportDiv.style.position = 'fixed';
    exportDiv.style.left = '-9999px';
    exportDiv.style.top = '0';
    exportDiv.style.zIndex = '-1';
    document.body.appendChild(exportDiv);
    // Render export-mode card using React 18+ root API
    const root = createRoot(exportDiv);
    root.render(<QuizShareCard result={result} exportMode={true} />);
    // Wait for render
    setTimeout(async () => {
      const cardNode = exportDiv.firstChild as HTMLElement;
      const canvas = await html2canvas(cardNode, {
        backgroundColor: '#000000',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        width: 1000,
        height: 1000,
      });
      const imageUrl = canvas.toDataURL('image/png');
      setGeneratedImageUrl(imageUrl);
      root.unmount();
      document.body.removeChild(exportDiv);
      if (onShare) {
        onShare(imageUrl);
      } else {
        // Download the image
        const link = document.createElement('a');
        link.download = `pansgpt-quiz-result-${Date.now()}.png`;
        link.href = imageUrl;
        link.click();
      }
      setIsGenerating(false);
    }, 100);
  };

  const shareToWhatsApp = async () => {
    // Generate image first if not already generated
    if (!generatedImageUrl) {
      await generateShareImage();
    }
    
    if (generatedImageUrl) {
      try {
        // Convert data URL to blob and create a File object
        const response = await fetch(generatedImageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'pansgpt-quiz-result.png', { type: 'image/png' });
        
        // Try to copy the image to clipboard first (works on some browsers)
        if (navigator.clipboard && navigator.clipboard.write) {
          try {
            // Create a ClipboardItem with the image
            const clipboardItem = new ClipboardItem({
              'image/png': blob
            });
            
            await navigator.clipboard.write([clipboardItem]);
            
            // Open WhatsApp Web - the image should be in clipboard
            const shareText = encodeURIComponent(getShareText());
            const whatsappUrl = `https://wa.me/?text=${shareText}`;
            window.open(whatsappUrl, '_blank');
            
            // Show success message
            alert('Image copied to clipboard! Paste it in WhatsApp (Ctrl+V or Cmd+V)');
            return;
            
          } catch (clipboardError) {
            console.log('Clipboard API failed, trying Web Share API');
          }
        }
        
        // Try Web Share API with files (works on mobile)
        if (navigator.share && navigator.canShare) {
          const shareData = {
            title: 'PANSGPT Quiz Results',
            text: getShareText(),
            files: [file]
          };
          
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData);
              return;
            } catch (error) {
              console.log('Web Share API failed, trying download method');
            }
          }
        }
        
        // Fallback: Download image and provide clear instructions
        const link = document.createElement('a');
        link.download = 'pansgpt-quiz-result.png';
        link.href = generatedImageUrl;
        link.click();
        
        // Open WhatsApp Web
        const shareText = encodeURIComponent(getShareText());
        const whatsappUrl = `https://wa.me/?text=${shareText}`;
        window.open(whatsappUrl, '_blank');
        
        // Show clear instructions
        setTimeout(() => {
          alert('Image downloaded! To share:\n1. Open WhatsApp Web\n2. Click the attachment button (📎)\n3. Select the downloaded image\n4. Send your message');
        }, 500);
        
      } catch (error) {
        console.error('Error sharing image:', error);
        
        // Final fallback
        const link = document.createElement('a');
        link.download = `pansgpt-quiz-result-${Date.now()}.png`;
        link.href = generatedImageUrl;
        link.click();
        
        const shareText = encodeURIComponent(getShareText());
        const whatsappUrl = `https://wa.me/?text=${shareText}`;
        window.open(whatsappUrl, '_blank');
      }
    }
  };

  const openWhatsAppShare = (text: string) => {
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
  };

  // Card style logic
  const cardClass = exportMode
    ? 'bg-gradient-to-br from-green-900 via-black to-gray-900 flex flex-col items-center justify-between'
    : 'relative bg-gradient-to-br from-green-900 via-black to-gray-900 rounded-2xl text-white border border-green-500/20 overflow-hidden flex flex-col items-center justify-between';
  const cardStyle = exportMode
    ? { width: 1000, height: 1000, aspectRatio: '1/1', margin: 0, padding: 0, borderRadius: 0, boxShadow: 'none' }
    : {};

  return (
    <div className="space-y-4">
      {/* Share Card Preview */}
      <div 
        ref={cardRef}
        className={cardClass}
        style={cardStyle}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
          <div className="absolute top-8 right-8 w-40 h-40 bg-green-500 rounded-full blur-2xl"></div>
          <div className="absolute bottom-8 left-8 w-32 h-32 bg-blue-500 rounded-full blur-2xl"></div>
        </div>

        {/* Header */}
        <div className="relative z-10 text-center mt-16 mb-8 w-full flex flex-col items-center">
          <div className="w-40 h-40 mb-4 relative flex items-center justify-center">
            <Image
              src="/uploads/Logo.png"
              alt="PANSGPT Logo"
              width={160}
              height={160}
              className="object-contain"
            />
          </div>
          <p className="text-green-300 text-2xl font-semibold">Quiz Results</p>
        </div>

        {/* Score Section */}
        <div className="relative z-10 text-center mb-8 w-full">
          <div className="text-7xl font-extrabold text-white mb-2">
            {result.score}/{result.maxScore}
          </div>
          <div className="text-4xl font-bold text-green-400 mb-2">
            {result.percentage.toFixed(1)}%
          </div>
          <div className="text-2xl font-semibold text-green-300">
            {getScoreMessage(result.percentage)}
          </div>
        </div>

        {/* Quiz Info */}
        <div className="relative z-10 w-[80%] mx-auto mb-8">
          <div className="bg-green-900/30 rounded-xl p-8 border border-green-500/20">
            <h3 className="text-2xl font-bold text-white mb-2">
              {result.quiz.title}
            </h3>
            <p className="text-green-300 text-lg">
              {result.quiz.courseCode} - {result.quiz.courseTitle}
            </p>
            {result.quiz.topic && (
              <p className="text-gray-300 text-lg mt-2">
                Topic: {result.quiz.topic}
              </p>
            )}
          </div>
          {/* Time and Date */}
          <div className="flex justify-between text-lg text-gray-300 mt-4">
            {result.timeTaken && (
              <span>⏱️ {formatTime(result.timeTaken)}</span>
            )}
            <span>📅 {formatDate(result.completedAt)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-center mb-12 w-full">
          <div className="text-lg text-gray-400 mb-2">
            Powered by PANSGPT
          </div>
          <div className="text-lg text-green-400 font-semibold">
            Your AI Study Partner
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-8 right-8 w-16 h-16 bg-green-500/20 rounded-full"></div>
        <div className="absolute top-1/2 left-8 w-8 h-8 bg-blue-500/20 rounded-full"></div>
      </div>

      {/* Share Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={generateShareImage}
          disabled={isGenerating}
          className="flex items-center justify-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              📷 Download Image
            </>
          )}
        </button>

        <button
          onClick={shareToWhatsApp}
          disabled={isGenerating}
          className="flex items-center justify-center px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          📱 Share to WhatsApp
        </button>

        <button
          onClick={copyShareText}
          className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          {copied ? '✅ Copied!' : '📋 Copy Text'}
        </button>
      </div>

      {/* Share Instructions */}
      <div className="text-center text-sm text-gray-400 mt-4">
        <p>💡 Tip: The image will be copied to clipboard or downloaded for easy sharing!</p>
      </div>
    </div>
  );
} 