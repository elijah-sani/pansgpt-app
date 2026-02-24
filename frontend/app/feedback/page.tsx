"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '../../components/BackButton';

export default function FeedbackPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    level: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          recipientEmail: 'ojochegbeng@gmail.com'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send feedback');
      }

      setSubmitStatus('success');
      setFormData({ name: '', level: '', email: '', message: '' });
      
      // Redirect to home after 2 seconds
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (error) {
      console.error('Error sending feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const levels = [
    '100 Level',
    '200 Level',
    '300 Level',
    '400 Level',
    '500 Level',
    '600 Level'
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:text-white dark:[background-color:#0C120C] flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl mx-auto px-4">
        <div className="rounded-2xl p-8 flex flex-col gap-8 border bg-white dark:[background-color:#2D3A2D] border-gray-200 dark:border-white/10 max-w-2xl mx-auto">
        {/* Back Button */}
        <div className="mb-4">
          <BackButton href="/main" label="Back to Chat" />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-white">Send Feedback</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-white">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-lg border text-gray-900 dark:text-white px-4 py-2 focus:outline-none focus:ring-2 transition-colors placeholder-gray-400 dark:placeholder-white/50 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20 focus:border-green-600 dark:focus:border-[#00A400]"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label htmlFor="level" className="block text-sm font-medium text-gray-700 dark:text-white">
                Level
              </label>
              <select
                id="level"
                name="level"
                value={formData.level}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-lg border text-gray-900 dark:text-white px-4 py-2 focus:outline-none focus:ring-2 transition-colors bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20 focus:border-green-600 dark:focus:border-[#00A400]"
              >
                <option value="" className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">Select your level</option>
                {levels.map((level) => (
                  <option key={level} value={level} className="bg-white dark:bg-[#2D3A2D] text-gray-900 dark:text-white">
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-white">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={4}
                className="mt-1 block w-full rounded-lg border text-gray-900 dark:text-white px-4 py-2 focus:outline-none focus:ring-2 transition-colors resize-none placeholder-gray-400 dark:placeholder-white/50 bg-gray-50 dark:bg-black/20 border-gray-300 dark:border-white/20 focus:border-green-600 dark:focus:border-[#00A400]"
                placeholder="Enter your feedback..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-lg font-medium text-white transition-all bg-green-600 dark:bg-[#00A400] hover:bg-green-700 dark:hover:bg-[#00B400] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </button>

          {submitStatus === 'success' && (
            <p className="text-center" style={{ color: '#00A400' }}>Feedback sent successfully!</p>
          )}
          {submitStatus === 'error' && (
            <p className="text-center" style={{ color: '#dc2626' }}>Failed to send feedback. Please try again.</p>
          )}
        </form>
        </div>
      </div>
    </div>
  );
} 