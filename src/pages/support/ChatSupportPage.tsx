import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, RefreshCw, Send, User } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useAiPromptKnowledge } from '../../hooks/useAiPromptKnowledge';
import { createOpenRouterChatCompletion, type OpenRouterMessage } from '../../lib/openrouter';
import { useToast } from '../../components/ui/Toast';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    audioUrl?: string; // URL for playable audio blob
};

type SupportMessage = {
    id: string;
    user_id: string;
    sender_type: 'user' | 'support' | 'assistant';
    sender_id: string | null;
    sender_role: string | null;
    content: string;
    created_at: string;
};

type InboxItem = {
    userId: string;
    username: string;
    lastMessage: string;
    lastAt: string;
};

const SUPPORT_TABLE = 'support_messages';
const INTRO_MESSAGE =
    'Hi, ako si Leah, support assistant mo. Nandito ako para tumulong - ' +
    'itanong mo lang ang tungkol sa wallet, bets, o account mo.';

const baseSystemPrompt = [
    'You are the SABONG192 support assistant named Leah.',
    'Respond in calm, cute, and slightly flirty Tagalog.',
    'Be helpful but playful. Use emojis occasionally.',
    'Use the provided user context to answer questions about the user account,',
    'bets, transactions, and requests.',
    'If the answer is not in the context, say so and ask a follow-up question.',
    'Never invent account data.',
    'Keep responses concise, warm, and charming.',
    'Do not mention balances unless the user asks or it is directly relevant.',
    'Do not mention being an AI.',
    'Speak as if you are a real person talking to a crush.',
    'When laughing, use "AHAHA" instead of "haha" or "hehe".',
    'REWARDS SYSTEM KNOWLEDGE:',
    '1. Win Streak (WS): Earn rewards for consecutive wins (5, 10, 15...).',
    '2. Lose Streak (LS): Earn rewards for consecutive losses (5, 10, 15...). Even bad luck pays!',
    '3. Tickets: Earn 1 Ticket for every match with at least 100 peso bet.',
    '4. Raffles: Use Tickets to buy entries for Weekly Raffles on the Rewards page.',
    '5. Claims: Go to [Rewards Page](/rewards) to claim streak rewards (Once per month).',
    'If a user mentions streaks or tickets, explain how to get them and where to claim.',
].join(' ');

const pageHintPrompt = [
    'If a user question maps to a page or tool, suggest the relevant page and',
    'path in a short Tagalog sentence.',
    'IMPORTANT: Format links using Markdown syntax: [Link Text](/path).',
    'Example: "Pwede kang mag-cash in sa [Wallet Page](/wallet)."',
    'Example pages: Dashboard /, Wallet /wallet, Match History /history,',
    'Transactions /transactions, Settings /settings, Chat Support /support,',
    'Admin Logs /admin-logs, Users /users, Betting /betting, Rewards /rewards.',
    'Only suggest pages likely available for the user role.',
].join(' ');

const MessageContent = ({ content }: { content: string }) => {
    // Split by markdown link pattern: [text](url)
    const parts = content.split(/(\[.*?\]\(.*?\))/g);

    return (
        <>
            {parts.map((part, i) => {
                const match = part.match(/\[(.*?)\]\((.*?)\)/);
                if (match) {
                    const [_, text, url] = match;
                    const isInternal = url.startsWith('/');
                    if (isInternal) {
                        return (
                            <Link key={i} to={url} className="text-casino-gold-400 hover:text-casino-gold-300 hover:underline font-bold decoration-2 underline-offset-2 transition-all text-base">
                                {text}
                            </Link>
                        );
                    }
                    return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-casino-gold-400 hover:text-casino-gold-300 hover:underline font-bold decoration-2 underline-offset-2 transition-all text-base">
                            {text}
                        </a>
                    );
                }
                return part;
            })}
        </>
    );
};

const cashInOutPrompt = [
    'If the user asks about cash in or cash out status, reply:',
    '"Pakiantay po, sir, darating din po yan."',
    'Then ask a short follow-up and suggest checking the Wallet page if',
    'appropriate.',
].join(' ');

const calmPrompt = [
    'If the user is angry, stay calm and sweet.',
    'Apologize gently and offer to help.',
    'Use a soothing voice/tone in text.',
    'Do not be defensive.',
    'Example: "Hala sorry po sir. Ayusin natin yan agad `heart`."',
].join(' ');

// Helper to convert Raw PCM16 (Base64) to WAV Blob
const pcm16ToWavBlob = (base64Data: string): Blob => {
    // 1. Decode Base64 to Binary String
    const binary = atob(base64Data);
    const len = binary.length;
    const buffer = new ArrayBuffer(len);
    const view = new DataView(buffer);
    for (let i = 0; i < len; i++) {
        view.setUint8(i, binary.charCodeAt(i));
    }

    // 2. Create WAV Header (44 bytes)
    const numOfChan = 1;
    const sampleRate = 24000;
    const headerBuffer = new ArrayBuffer(44);
    const headerView = new DataView(headerBuffer);
    const byteRate = sampleRate * numOfChan * 2; // 16-bit = 2 bytes
    const blockAlign = numOfChan * 2;
    const dataSize = len;

    // RIFF chunk descriptor
    writeString(headerView, 0, 'RIFF');
    headerView.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(headerView, 8, 'WAVE');

    // fmt sub-chunk
    writeString(headerView, 12, 'fmt ');
    headerView.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    headerView.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    headerView.setUint16(22, numOfChan, true); // NumChannels
    headerView.setUint32(24, sampleRate, true); // SampleRate
    headerView.setUint32(28, byteRate, true); // ByteRate
    headerView.setUint16(32, blockAlign, true); // BlockAlign
    headerView.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(headerView, 36, 'data');
    headerView.setUint32(40, dataSize, true); // Subchunk2Size

    // 3. Combine Header and Data
    return new Blob([headerView, view], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

export const ChatSupportPage = () => {
    const { profile, session, refreshProfile } = useAuthStore();
    const { knowledge } = useAiPromptKnowledge();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'intro',
            role: 'assistant',
            content: INTRO_MESSAGE,
            createdAt: new Date().toISOString(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [storedContact, setStoredContact] = useState<string | null>(null);
    const [contactInput, setContactInput] = useState('');
    const [contactType, setContactType] = useState<'phone' | 'email'>('phone');
    const [savingContact, setSavingContact] = useState(false);
    const [activeView, setActiveView] = useState<'chat' | 'inbox'>('chat');
    const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedMessages, setSelectedMessages] = useState<SupportMessage[]>([]);
    const [inboxLoading, setInboxLoading] = useState(false);
    const [replyInput, setReplyInput] = useState('');
    const [isReplying, setIsReplying] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const replyRef = useRef<HTMLTextAreaElement | null>(null);

    const canChat = Boolean(profile?.id);
    const emailOnFile = session?.user?.email?.trim() || '';
    const phoneOnFile = profile?.phone_number?.trim() || '';
    const contactReady = Boolean(emailOnFile || phoneOnFile || storedContact);
    const isAdmin = profile?.role === 'admin';
    const aiEnabled = profile?.role === 'user';

    // Audio Chat State
    const [audioEnabled, setAudioEnabled] = useState(false);

    useEffect(() => {
        // Check universal audio setting
        const fetchSettings = async () => {
            const { data } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'audio_chat_enabled')
                .single();
            if (data?.value === 'true') {
                setAudioEnabled(true);
            }
        };
        fetchSettings();
    }, []);

    useEffect(() => {
        if (!profile?.id || typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(`support_contact_${profile.id}`);
        if (stored) setStoredContact(stored);
    }, [profile?.id]);

    useEffect(() => {
        if (isAdmin) {
            setActiveView('inbox');
        } else {
            setActiveView('chat');
        }
    }, [isAdmin]);

    useEffect(() => {
        if (!profile?.id) return;
        fetchUserMessages(profile.id);

        const channel = supabase
            .channel(`support-messages-user-${profile.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: SUPPORT_TABLE,
                    filter: `user_id=eq.${profile.id}`,
                },
                (payload) => {
                    const message = payload.new as SupportMessage | undefined;
                    if (!message?.id) return;
                    setMessages((prev) => {
                        if (prev.some((item) => item.id === message.id)) return prev;
                        const mapped: ChatMessage = {
                            id: message.id,
                            role: message.sender_type === 'user' ? 'user' : 'assistant',
                            content: message.content,
                            createdAt: message.created_at,
                        };
                        return [...prev, mapped];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile?.id]);

    useEffect(() => {
        if (!profile?.id) return;
        const interval = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            fetchUserMessages(profile.id);
        }, 30_000);

        return () => {
            clearInterval(interval);
        };
    }, [profile?.id]);

    useEffect(() => {
        if (!isAdmin || activeView !== 'inbox') return;
        fetchInbox();

        const channel = supabase
            .channel('support-messages-inbox')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: SUPPORT_TABLE,
                },
                (payload) => {
                    const message = payload.new as SupportMessage | undefined;
                    if (!message?.id) return;

                    setInboxItems((prev) => {
                        const existingIndex = prev.findIndex((item) => item.userId === message.user_id);
                        const updatedItem: InboxItem = {
                            userId: message.user_id,
                            username: prev[existingIndex]?.username || `User ${message.user_id.slice(0, 6)}`,
                            lastMessage: message.content,
                            lastAt: message.created_at,
                        };
                        if (existingIndex >= 0) {
                            const next = [...prev];
                            next.splice(existingIndex, 1);
                            return [updatedItem, ...next];
                        }
                        return [updatedItem, ...prev];
                    });

                    if (selectedUserId && message.user_id === selectedUserId) {
                        setSelectedMessages((prev) => {
                            if (prev.some((item) => item.id === message.id)) return prev;
                            return [...prev, message];
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeView, isAdmin, selectedUserId]);

    useEffect(() => {
        if (!isAdmin || activeView !== 'inbox') return;
        const interval = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            fetchInbox();
            if (selectedUserId) {
                fetchConversationMessages(selectedUserId);
            }
        }, 30_000);

        return () => {
            clearInterval(interval);
        };
    }, [activeView, isAdmin, selectedUserId]);

    useEffect(() => {
        if (activeView !== 'inbox' || !selectedUserId) return;
        fetchConversationMessages(selectedUserId);
    }, [activeView, selectedUserId]);

    async function fetchUserMessages(userId: string) {
        const { data, error } = await supabase
            .from(SUPPORT_TABLE)
            .select('id,user_id,sender_type,content,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(200);

        if (error) {
            console.error('Failed to load support messages:', error);
            setMessages([
                {
                    id: 'intro',
                    role: 'assistant',
                    content: INTRO_MESSAGE,
                    createdAt: new Date().toISOString(),
                },
            ]);
            return;
        }

        if (!data || data.length === 0) {
            setMessages([
                {
                    id: 'intro',
                    role: 'assistant',
                    content: INTRO_MESSAGE,
                    createdAt: new Date().toISOString(),
                },
            ]);
            return;
        }

        const mapped = data.map((message) => ({
            id: message.id,
            role: message.sender_type === 'user' ? 'user' : 'assistant',
            content: message.content,
            createdAt: message.created_at,
        })) as ChatMessage[];

        setMessages(mapped);
    }

    async function fetchInbox() {
        setInboxLoading(true);
        try {
            const { data, error } = await supabase
                .from(SUPPORT_TABLE)
                .select('id,user_id,content,created_at,sender_type')
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;

            const lastByUser = new Map<string, SupportMessage>();
            const userIds: string[] = [];

            data?.forEach((message) => {
                if (!lastByUser.has(message.user_id)) {
                    lastByUser.set(message.user_id, message as SupportMessage);
                    userIds.push(message.user_id);
                }
            });

            let profilesMap = new Map<string, string>();
            if (userIds.length > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id,username')
                    .in('id', userIds);

                profilesData?.forEach((row) => {
                    profilesMap.set(row.id, row.username);
                });
            }

            const items = userIds
                .map((userId) => {
                    const message = lastByUser.get(userId);
                    return {
                        userId,
                        username: profilesMap.get(userId) || `User ${userId.slice(0, 6)}`,
                        lastMessage: message?.content || '',
                        lastAt: message?.created_at || '',
                    };
                })
                .filter((item) => item.lastAt)
                .sort((a, b) => (a.lastAt > b.lastAt ? -1 : 1));

            setInboxItems(items);
            if (!selectedUserId && items.length > 0) {
                setSelectedUserId(items[0].userId);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load inbox.';
            showToast(message, 'error');
        } finally {
            setInboxLoading(false);
        }
    }

    async function fetchConversationMessages(userId: string) {
        const { data, error } = await supabase
            .from(SUPPORT_TABLE)
            .select('id,user_id,sender_type,sender_role,sender_id,content,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(200);

        if (error) {
            showToast(error.message || 'Failed to load chat logs.', 'error');
            return;
        }

        setSelectedMessages((data || []) as SupportMessage[]);
    }

    const persistSupportMessage = async (payload: {
        user_id: string;
        sender_type: SupportMessage['sender_type'];
        sender_id: string | null;
        sender_role: string | null;
        content: string;
    }) => {
        const { error } = await supabase.from(SUPPORT_TABLE).insert(payload);
        if (error) {
            console.error('Failed to save support message:', error);
        }
    };

    const buildContextPayload = async () => {
        if (!profile?.id) {
            return {
                profile: null,
                recent_transactions: [],
                recent_requests: [],
                recent_bets: [],
                context_errors: ['Missing user profile.'],
            };
        }

        const contextErrors: string[] = [];

        const [transactionsResult, requestsResult, betsResult] = await Promise.all([
            supabase
                .from('transactions')
                .select('id,type,amount,created_at,sender_id,receiver_id')
                .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('transaction_requests')
                .select('id,type,amount,status,created_at,payment_method,chain')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('bets')
                .select('id,match_id,amount,selection,status,payout,created_at')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        if (transactionsResult.error) {
            contextErrors.push(`transactions: ${transactionsResult.error.message}`);
        }
        if (requestsResult.error) {
            contextErrors.push(`requests: ${requestsResult.error.message}`);
        }
        if (betsResult.error) {
            contextErrors.push(`bets: ${betsResult.error.message}`);
        }

        return {
            profile: {
                id: profile.id,
                username: profile.username,
                role: profile.role,
                balance: profile.balance,
                status: profile.status,
                created_at: profile.created_at,
                referral_code: profile.referral_code,
            },
            recent_transactions: transactionsResult.data ?? [],
            recent_requests: requestsResult.data ?? [],
            recent_bets: betsResult.data ?? [],
            rewards_context: {
                win_streak: profile.win_streak,
                lose_streak: profile.lose_streak,
                tickets: profile.tickets
            },
            context_errors: contextErrors,
        };
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || !canChat || isSending) return;
        if (!contactReady) {
            showToast('Maglagay muna ng mobile o email bago mag-chat.', 'info');
            return;
        }

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: trimmed,
            createdAt: new Date().toISOString(),
        };

        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput('');
        setIsSending(true);

        await persistSupportMessage({
            user_id: profile?.id || '',
            sender_type: 'user',
            sender_id: profile?.id || null,
            sender_role: profile?.role || null,
            content: trimmed,
        });

        if (!aiEnabled) {
            showToast('Naipadala na sa admin. Pakiantay po ng reply.', 'success');
            setIsSending(false);
            inputRef.current?.focus();
            return;
        }

        try {
            const contextPayload = await buildContextPayload();


            const systemMessages: OpenRouterMessage[] = [
                { role: 'system', content: baseSystemPrompt },
                {
                    role: 'system',
                    content: knowledge
                        ? `Admin prompt knowledge: ${knowledge}`
                        : 'Admin prompt knowledge: (none provided).',
                },
                {
                    role: 'system',
                    content: `User context (JSON): ${JSON.stringify(contextPayload)}`,
                },
                { role: 'system', content: pageHintPrompt },
                { role: 'system', content: cashInOutPrompt },
                { role: 'system', content: calmPrompt },
            ];

            const history = nextMessages.slice(-12).map((message) => ({
                role: message.role,
                content: message.content,
            })) as OpenRouterMessage[];

            // 30% chance to reply with audio if enabled
            const shouldReplyWithAudio = audioEnabled && Math.random() < 0.3;

            const response = await createOpenRouterChatCompletion(
                [...systemMessages, ...history],
                shouldReplyWithAudio ? {
                    model: 'openai/gpt-audio-mini',
                    modalities: ['text', 'audio']
                } : undefined
            );

            // Handle Response (String or Audio Object)
            let assistantContent = '';
            let audioBlobUrl: string | undefined;

            if (typeof response === 'string') {
                assistantContent = response;
            } else {
                assistantContent = response.content;
                // Convert PCM16 to WAV Blob URL
                if (response.audio?.data) {
                    try {
                        const blob = pcm16ToWavBlob(response.audio.data);
                        audioBlobUrl = URL.createObjectURL(blob);
                    } catch (err) {
                        console.error("Failed to convert audio:", err);
                    }
                }
            }

            const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: assistantContent,
                createdAt: new Date().toISOString(),
                audioUrl: audioBlobUrl,
            };

            setMessages((prev) => [...prev, assistantMessage]);

            await persistSupportMessage({
                user_id: profile?.id || '',
                sender_type: 'assistant',
                sender_id: null,
                sender_role: 'support',
                content: assistantContent,
            });
        } catch (error: unknown) {
            console.error('Chat error:', error);
            let message = 'Hindi maabot ang support sa ngayon.';

            if (error instanceof Error) {
                if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                    message = 'System Maintenance: Chat is temporarily unavailable (Config Error).';
                } else {
                    message = error.message;
                }
            }

            showToast(message, 'error');
            setMessages((prev) => [
                ...prev,
                {
                    id: `assistant-error-${Date.now()}`,
                    role: 'assistant',
                    content: 'System Message: Chat support is currently offline for maintenance. Please check back later.',
                    createdAt: new Date().toISOString(),
                },
            ]);
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    };

    const handleSupportReply = async () => {
        if (!isAdmin || !replyInput.trim() || !profile?.id || !selectedUserId || isReplying) return;
        setIsReplying(true);
        const trimmed = replyInput.trim();

        await persistSupportMessage({
            user_id: selectedUserId,
            sender_type: 'support',
            sender_id: profile.id,
            sender_role: profile.role,
            content: trimmed,
        });

        setReplyInput('');
        await fetchConversationMessages(selectedUserId);
        setIsReplying(false);
        replyRef.current?.focus();
    };

    const resetConversation = () => {
        setMessages([
            {
                id: 'intro',
                role: 'assistant',
                content: INTRO_MESSAGE,
                createdAt: new Date().toISOString(),
            },
        ]);
    };

    const handleSaveContact = async () => {
        if (!profile?.id) return;
        const trimmed = contactInput.trim();
        if (!trimmed) {
            showToast('Maglagay ng mobile o email.', 'error');
            return;
        }

        const isEmail = contactType === 'email';
        const isPhone = contactType === 'phone';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[0-9+()\-\s]{7,}$/;

        if (isEmail && !emailRegex.test(trimmed)) {
            showToast('Maglagay ng valid na email.', 'error');
            return;
        }

        if (isPhone && !phoneRegex.test(trimmed)) {
            showToast('Maglagay ng valid na mobile number.', 'error');
            return;
        }

        setSavingContact(true);
        try {
            if (isPhone) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ phone_number: trimmed })
                    .eq('id', profile.id);

                if (error) throw error;
                await refreshProfile();
            }

            if (typeof window !== 'undefined') {
                window.localStorage.setItem(`support_contact_${profile.id}`, trimmed);
                setStoredContact(trimmed);
            }

            setContactInput('');
            showToast('Saved na ang contact. Pwede ka nang mag-chat.', 'success');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Hindi ma-save ang contact info.';
            showToast(message, 'error');
        } finally {
            setSavingContact(false);
        }
    };



    const contactSummary = useMemo(() => {
        if (phoneOnFile) {
            const safePhone = phoneOnFile.length > 4 ? phoneOnFile.slice(-4) : phoneOnFile;
            return `Mobile ending ${safePhone}`;
        }
        if (emailOnFile) return emailOnFile;
        return storedContact || 'Not set';
    }, [emailOnFile, phoneOnFile, storedContact]);

    const selectedUserInfo = useMemo(() => {
        if (!selectedUserId) return null;
        return inboxItems.find((item) => item.userId === selectedUserId) || null;
    }, [inboxItems, selectedUserId]);

    return (
        <div className="h-[calc(100vh-140px)] md:h-[600px] flex flex-col">
            {/* Header - Mobile Optimized */}
            <div className="flex items-center justify-between px-3 py-2 md:px-0 md:py-0 md:mb-4 border-b border-white/5 md:border-0 shrink-0">
                <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                        <Bot className="text-white" size={18} />
                    </div>
                    <div>
                        <h1 className="text-base md:text-2xl font-bold text-white">Leah - Support</h1>
                        <p className="text-xs text-green-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-400"></span>
                            Online
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button
                            onClick={() => setActiveView(activeView === 'inbox' ? 'chat' : 'inbox')}
                            className="px-3 py-2 bg-white/10 rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-all"
                        >
                            {activeView === 'inbox' ? 'My Chat' : 'Inbox'}
                        </button>
                    )}
                    <button
                        onClick={resetConversation}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-all"
                        title="New Chat"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {activeView === 'inbox' && isAdmin ? (
                <div className="flex-1 flex flex-col md:grid md:grid-cols-[280px_1fr] md:gap-4 bg-[#121212] md:bg-transparent min-h-0">
                    {/* Inbox List - Full width on mobile */}
                    <div className="border-b border-white/5 md:border-0 md:glass-panel md:rounded-2xl overflow-hidden shrink-0 md:shrink-1">
                        <div className="px-4 py-3 border-b border-white/5 bg-[#1a1a1a] md:bg-transparent">
                            <p className="text-sm font-bold text-white">Conversations</p>
                            {inboxLoading && <span className="text-xs text-gray-500">Loading...</span>}
                        </div>
                        <div className="max-h-[120px] md:max-h-[540px] overflow-y-auto">
                            {inboxItems.length === 0 && !inboxLoading && (
                                <p className="text-sm text-gray-500 p-4">No conversations yet.</p>
                            )}
                            {inboxItems.map((item) => (
                                <button
                                    key={item.userId}
                                    onClick={() => setSelectedUserId(item.userId)}
                                    className={clsx(
                                        'w-full text-left px-4 py-3 border-b border-white/5 transition-all flex items-center gap-3',
                                        selectedUserId === item.userId
                                            ? 'bg-[#2a2a2a]'
                                            : 'hover:bg-[#1a1a1a]'
                                    )}
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                                        <User size={18} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-white truncate">{item.username}</span>
                                            <span className="text-[10px] text-gray-500">
                                                {new Date(item.lastAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 truncate">{item.lastMessage}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chat Area - Messenger Style */}
                    <div className="flex-1 flex flex-col overflow-hidden md:glass-panel md:rounded-2xl min-h-0">
                        <div className="px-4 py-3 border-b border-white/5 bg-[#1a1a1a] flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                                <User size={16} className="text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">
                                    {selectedUserInfo ? selectedUserInfo.username : 'Select a user'}
                                </p>
                                {selectedUserInfo && (
                                    <p className="text-xs text-gray-400">
                                        Last active {new Date(selectedUserInfo.lastAt).toLocaleTimeString()}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#121212] min-h-0">
                            {selectedMessages.length === 0 && (
                                <p className="text-sm text-gray-500 text-center mt-10">Select a conversation to view messages.</p>
                            )}
                            {selectedMessages.map((message, index) => {
                                const isFirstInGroup = index === 0 || selectedMessages[index - 1].sender_type !== message.sender_type;
                                return (
                                    <div
                                        key={message.id}
                                        className={clsx(
                                            'flex',
                                            message.sender_type === 'user' ? 'justify-end' : 'justify-start'
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'max-w-[75%] px-3 py-2 text-[15px] leading-snug',
                                                message.sender_type === 'user'
                                                    ? 'bg-[#0084ff] text-white rounded-2xl rounded-br-md'
                                                    : 'bg-[#3a3a3a] text-white rounded-2xl rounded-bl-md',
                                                !isFirstInGroup && message.sender_type === 'user' && 'rounded-br-2xl',
                                                !isFirstInGroup && message.sender_type !== 'user' && 'rounded-bl-2xl'
                                            )}
                                        >
                                            <MessageContent content={message.content} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="bg-[#1a1a1a] px-3 py-2 border-t border-white/5 shrink-0">
                            <div className="flex items-end gap-2">
                                <textarea
                                    rows={1}
                                    value={replyInput}
                                    onChange={(e) => setReplyInput(e.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && !event.shiftKey) {
                                            event.preventDefault();
                                            handleSupportReply();
                                        }
                                    }}
                                    placeholder={selectedUserId ? 'Type a message...' : 'Select a user first...'}
                                    disabled={!selectedUserId || isReplying}
                                    ref={replyRef}
                                    className="flex-1 bg-[#2a2a2a] text-white px-4 py-2.5 rounded-full text-[15px] outline-none border border-transparent focus:border-blue-500 transition-all resize-none min-h-[40px] max-h-[100px]"
                                />
                                <button
                                    onClick={handleSupportReply}
                                    disabled={!selectedUserId || isReplying || !replyInput.trim()}
                                    className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-full transition-all shrink-0"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col md:grid md:grid-cols-[1fr_280px] md:gap-4 bg-[#121212] md:bg-transparent min-h-0">
                    {/* Chat Area - Full width on mobile */}
                    <div className="flex-1 flex flex-col overflow-hidden md:glass-panel md:rounded-2xl min-h-0">
                        {!contactReady && (
                            <div className="bg-[#1a1a1a] px-4 py-3 border-b border-white/5 shrink-0">
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-400">Maglagay ng mobile o email para makapag-chat</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setContactType('phone')}
                                            className={clsx(
                                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                                                contactType === 'phone'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white/10 text-gray-400'
                                            )}
                                        >
                                            Mobile
                                        </button>
                                        <button
                                            onClick={() => setContactType('email')}
                                            className={clsx(
                                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                                                contactType === 'email'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white/10 text-gray-400'
                                            )}
                                        >
                                            Email
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={contactInput}
                                            onChange={(e) => setContactInput(e.target.value)}
                                            placeholder={contactType === 'phone' ? 'Mobile number' : 'Email address'}
                                            className="flex-1 bg-[#2a2a2a] text-white px-4 py-2.5 rounded-full text-sm outline-none border border-white/5 focus:border-blue-500 transition-all"
                                        />
                                        <button
                                            onClick={handleSaveContact}
                                            disabled={savingContact}
                                            className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-medium disabled:opacity-50 transition-all"
                                        >
                                            {savingContact ? '...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Messages - Facebook Messenger Style */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#121212] min-h-0">
                            {messages.map((message, index) => {
                                const isFirstInGroup = index === 0 || messages[index - 1].role !== message.role;
                                return (
                                    <div
                                        key={message.id}
                                        className={clsx(
                                            'flex',
                                            message.role === 'user' ? 'justify-end' : 'justify-start'
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'max-w-[75%] px-3 py-2 text-[15px] leading-snug relative',
                                                message.role === 'user'
                                                    ? 'bg-[#0084ff] text-white rounded-2xl rounded-br-md'
                                                    : 'bg-[#3a3a3a] text-white rounded-2xl rounded-bl-md',
                                                !isFirstInGroup && message.role === 'user' && 'rounded-br-2xl',
                                                !isFirstInGroup && message.role === 'assistant' && 'rounded-bl-2xl'
                                            )}
                                        >
                                            <MessageContent content={message.content} />
                                            {message.audioUrl && (
                                                <div className="mt-2 pt-2 border-t border-white/20">
                                                    <audio controls src={message.audioUrl} className="h-8 w-full max-w-[180px]" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Input Area - Messenger Style */}
                        <div className="bg-[#1a1a1a] px-3 py-2 border-t border-white/5 shrink-0">
                            <div className="flex items-end gap-2">
                                <textarea
                                    rows={1}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && !event.shiftKey) {
                                            event.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    placeholder={!canChat ? 'Loading...' : contactReady ? 'Type a message...' : 'Add contact info...'}
                                    disabled={!canChat || isSending || !contactReady}
                                    ref={inputRef}
                                    className="flex-1 bg-[#2a2a2a] text-white px-4 py-2.5 rounded-full text-[15px] outline-none border border-transparent focus:border-blue-500 transition-all resize-none min-h-[40px] max-h-[100px]"
                                    style={{ height: 'auto' }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!canChat || isSending || !input.trim() || !contactReady}
                                    className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-full transition-all shrink-0"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar - Hidden on mobile */}
                    <div className="hidden md:block space-y-3">
                        <div className="glass-panel rounded-2xl p-4 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Your Info</p>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Username</span>
                                    <span className="text-white font-medium">{profile?.username || '---'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Role</span>
                                    <span className="text-blue-400 font-medium capitalize">{profile?.role || '---'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Contact</span>
                                    <span className="text-white text-xs">{contactSummary}</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel rounded-2xl p-4 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Quick Questions</p>
                            <div className="space-y-2">
                                {['Check my cash in/out status', 'View my recent bets', 'Why was my request rejected?', 'Where is my transaction history?'].map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { setInput(q); inputRef.current?.focus(); }}
                                        className="w-full text-left text-sm text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg transition-all"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
