
import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useI18n } from '../contexts/I18nContext';

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });
};

const ImageEditor: React.FC = () => {
    const { t } = useI18n();
    const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setOriginalImageFile(file);
            if (originalImageUrl) {
                URL.revokeObjectURL(originalImageUrl);
            }
            setOriginalImageUrl(URL.createObjectURL(file));
            setEditedImageUrl(null);
            setError(null);
        }
    };

    const handleGenerate = async () => {
        if (!originalImageFile || !prompt.trim()) {
            setError('Please upload an image and enter a prompt.');
            return;
        }

        setLoading(true);
        setError(null);
        setEditedImageUrl(null);

        if (!process.env.API_KEY) {
            setError("API key is not configured.");
            setLoading(false);
            return;
        }

        try {
            /* Create a new GoogleGenAI instance right before making an API call to ensure it always uses the up-to-date API key */
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const base64Data = await fileToBase64(originalImageFile);

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: originalImageFile.type,
                            },
                        },
                        {
                            text: prompt,
                        },
                    ],
                },
            });

            /* Iterate through all parts to find the image part, as guidelines state not to assume it is the first part */
            let foundImage = false;
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64EncodeString: string = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType || 'image/png';
                        const imageUrl = `data:${mimeType};base64,${base64EncodeString}`;
                        setEditedImageUrl(imageUrl);
                        foundImage = true;
                        break;
                    } else if (part.text) {
                        console.log("Model response text:", part.text);
                    }
                }
            }

            if (!foundImage) {
                throw new Error("No image was generated. The model may have refused the request.");
            }

        } catch (err) {
            console.error("Gemini API call failed:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred while generating the image.");
        } finally {
            setLoading(false);
        }
    };

    // Drag and drop handler
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setOriginalImageFile(file);
            if (originalImageUrl) {
                URL.revokeObjectURL(originalImageUrl);
            }
            setOriginalImageUrl(URL.createObjectURL(file));
            setEditedImageUrl(null);
            setError(null);
        }
    }, [originalImageUrl]);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div>
            <h1 className="text-5xl font-bold text-white [text-shadow:0_4px_12px_rgba(0,0,0,0.5)] mb-8">{t('image_editor')}</h1>

            <div className="p-6 bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-lg mb-8">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <label htmlFor="prompt-input" className="sr-only">{t('prompt_placeholder')}</label>
                        <input
                            id="prompt-input"
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t('prompt_placeholder')}
                            className="w-full p-4 bg-black/20 text-white placeholder-gray-400 border border-white/20 rounded-xl focus:ring-blue-400 focus:border-blue-400 text-lg"
                        />
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !originalImageFile || !prompt.trim()}
                        className="px-8 py-4 bg-[var(--color-primary)] text-white font-bold rounded-xl hover:bg-[var(--color-primary-hover)] transition-all shadow-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? t('processing_image') : t('generate')}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 mb-8 bg-red-900/50 text-red-200 border border-red-700 rounded-xl">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Original Image */}
                <div className="space-y-4">
                    <h2 className="text-3xl font-bold text-center text-white">{t('original_image')}</h2>
                    <div
                        className="relative aspect-square w-full bg-black/20 backdrop-blur-2xl rounded-3xl border-2 border-dashed border-white/20 shadow-lg flex items-center justify-center text-gray-400"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    >
                        {originalImageUrl ? (
                            <img src={originalImageUrl} alt="Original" className="w-full h-full object-contain rounded-3xl" />
                        ) : (
                            <div className="text-center p-4">
                                <p>{t('upload_prompt')}</p>
                                <input
                                    type="file"
                                    id="image-upload"
                                    className="sr-only"
                                    accept="image/png, image/jpeg, image/webp"
                                    onChange={handleImageChange}
                                />
                                <label htmlFor="image-upload" className="mt-4 inline-block px-6 py-2 bg-[var(--color-primary)] text-white font-bold rounded-xl hover:bg-[var(--color-primary-hover)] transition-all shadow-md cursor-pointer">
                                    {t('upload_image')}
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                {/* Edited Image */}
                <div className="space-y-4">
                    <h2 className="text-3xl font-bold text-center text-white">{t('edited_image')}</h2>
                    <div className="relative aspect-square w-full bg-black/20 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-lg flex items-center justify-center">
                        {loading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-3xl z-10">
                                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
                            </div>
                        )}
                        {editedImageUrl ? (
                            <img src={editedImageUrl} alt="Edited" className="w-full h-full object-contain rounded-3xl" />
                        ) : (
                            <div className="text-gray-500">{originalImageUrl ? 'Edit result will appear here' : 'Upload an image to get started'}</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageEditor;
