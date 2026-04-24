"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "../../components/BackButton";

export default function FeedbackPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    level: "",
    email: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          recipientEmail: "ojochegbeng@gmail.com",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send feedback");
      }

      setSubmitStatus("success");
      setFormData({ name: "", level: "", email: "", message: "" });

      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error("Error sending feedback:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const levels = [
    "100 Level",
    "200 Level",
    "300 Level",
    "400 Level",
    "500 Level",
    "600 Level",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl mx-auto px-4">
        <div className="rounded-2xl p-8 flex flex-col gap-8 border border-border bg-card max-w-2xl mx-auto">
          <div className="mb-4">
            <BackButton href="/main" label="Back to Chat" />
          </div>

          <h1 className="text-2xl font-bold mb-6 text-center">Send Feedback</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="mt-1 block w-full rounded-lg border border-border bg-input-background text-foreground px-4 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label htmlFor="level" className="block text-sm font-medium">
                  Level
                </label>
                <select
                  id="level"
                  name="level"
                  value={formData.level}
                  onChange={handleChange}
                  required
                  className="mt-1 block w-full rounded-lg border border-border bg-input-background text-foreground px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="">Select your level</option>
                  {levels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={4}
                  className="mt-1 block w-full rounded-lg border border-border bg-input-background text-foreground px-4 py-2 resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your feedback..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg font-medium text-primary-foreground transition-all bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Sending..." : "Send Feedback"}
            </button>

            {submitStatus === "success" && (
              <p className="text-center text-primary">Feedback sent successfully!</p>
            )}
            {submitStatus === "error" && (
              <p className="text-center text-destructive">
                Failed to send feedback. Please try again.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
