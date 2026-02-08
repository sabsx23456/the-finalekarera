
import { useState } from 'react';
import { LiveStreamPlayer } from '../components/LiveStreamPlayer';

export const StreamTest = () => {
    const [videoId, setVideoId] = useState('');

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <h1 className="text-3xl font-bold mb-6">Cloudflare Stream Integration Test</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-xl font-semibold mb-4">Configuration</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Video ID or Signed URL</label>
                                <input
                                    type="text"
                                    value={videoId}
                                    onChange={(e) => setVideoId(e.target.value)}
                                    placeholder="Enter Cloudflare Video ID"
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    Paste your Cloudflare Stream Video ID here to test playback.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-xl font-semibold mb-4">Instructions</h2>
                        <ol className="list-decimal list-inside space-y-2 text-gray-300">
                            <li>Go to your Cloudflare Stream Dashboard.</li>
                            <li>Upload a video or create a live input.</li>
                            <li>Copy the <strong>Video ID</strong> or <strong>Signed URL</strong>.</li>
                            <li>Paste it in the input field above.</li>
                        </ol>
                    </div>
                </div>

                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Preview</h2>
                    <LiveStreamPlayer
                        videoOrSignedId={videoId}
                        autoplay={false}
                        muted={false}
                        className="shadow-2xl"
                    />
                </div>
            </div>
        </div>
    );
};
