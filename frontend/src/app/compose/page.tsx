"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";

export default function ComposePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delay, setDelay] = useState("0");
  const [hourlyLimit, setHourlyLimit] = useState("0");
  const [scheduleTime, setScheduleTime] = useState("");
  const [loading, setLoading] = useState(false);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
    },
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) setFile(acceptedFiles[0]);
    },
    maxFiles: 1,
  });

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !subject || !body || !scheduleTime) {
      alert("Please fill all required fields and upload a CSV.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("csv", file);
    formData.append("subject", subject);
    formData.append("body", body);
    const localDate = new Date(scheduleTime);
    formData.append("startTime", localDate.toISOString());
    formData.append("delayBetweenEmails", delay);
    formData.append("hourlyLimit", hourlyLimit);
    // TODO: Fetch senderId dynamically from selected sender in UI
    formData.append("senderId", "sender-uuid-placeholder"); 

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${apiUrl}/emails/schedule`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        alert("Campaign scheduled successfully!");
        router.push("/");
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to schedule", error);
      alert("Failed to connect to server");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex justify-center">
      <div className="max-w-4xl w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-2">
            ← Compose New Email
          </button>
          <div className="flex items-center gap-4">
            <input 
              type="datetime-local" 
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-green-500"
              required
            />
            <button 
              onClick={handleSchedule}
              disabled={loading}
              className="px-6 py-2 bg-white text-green-600 border border-green-500 rounded-full text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              {loading ? "Scheduling..." : "Send Later"}
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
          <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
            <span className="text-gray-500 text-sm w-12">From</span>
            <select className="bg-gray-50 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-green-500">
              <option>oliver.brown@domain.io</option>
            </select>
          </div>

          <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
            <span className="text-gray-500 text-sm w-12">To</span>
            <div 
              {...getRootProps()} 
              className={`flex-1 border-2 border-dashed rounded-lg p-3 text-center text-sm cursor-pointer transition-colors ${file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <input {...getInputProps()} />
              {file ? (
                <span className="text-green-700 font-medium">Uploaded: {file.name}</span>
              ) : (
                <span className="text-green-600 flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Upload List (.csv)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-gray-100 pb-4">
            <span className="text-gray-500 text-sm w-12">Subject</span>
            <input 
              type="text" 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject" 
              className="flex-1 outline-none text-sm placeholder-gray-400 font-medium"
            />
          </div>

          <div className="flex items-center gap-8 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 font-medium">Delay between emails (ms)</span>
              <input 
                type="number" 
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                className="w-20 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-green-500" 
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700 font-medium">Hourly Limit</span>
              <input 
                type="number" 
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(e.target.value)}
                className="w-20 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-green-500" 
              />
            </div>
          </div>

          {/* Email Body Textarea */}
          <div className="flex-1 flex flex-col mt-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type Your Reply..."
              className="flex-1 w-full bg-gray-50 border border-gray-100 rounded-xl p-6 outline-none resize-none focus:ring-1 focus:ring-green-500 text-sm"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  );
}
