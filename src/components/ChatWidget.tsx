import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Send, 
  Users, 
  MessageSquare, 
  Pin, 
  PinOff, 
  Edit3, 
  Check,
  Search,
  CheckCheck,
  Smile,
  CornerUpLeft,
  Paperclip,
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  Image,
  FileText,
  MapPin,
  Trash
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { User as UserType, Message } from '../types';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface ChatWidgetProps {
  currentUser: UserType;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}

export default function ChatWidget({ currentUser, isOpen, setIsOpen }: ChatWidgetProps) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isChatOpen = isOpen !== undefined ? isOpen : localIsOpen;
  const handleSetOpen = setIsOpen !== undefined ? setIsOpen : setLocalIsOpen;

  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  
  // WhatsApp layout state
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>('all'); // 'all' means group chat, null means list view (on mobile)
  const [typedMessage, setTypedMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // Sidebar contacts search
  const [messageSearchQuery, setMessageSearchQuery] = useState(''); // Active chat messages search
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  // Real-time status state
  const [partnerTyping, setPartnerTyping] = useState<boolean>(false);
  const [activeMenuMessage, setActiveMenuMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  
  // Simulated features
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPickerForMsgId, setShowEmojiPickerForMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time messages and fetch users
  useEffect(() => {
    if (isChatOpen) {
      // 1. Fetch Users List
      const fetchUsers = async () => {
        try {
          const fetchedUsers = await dbService.getUsers();
          setUsers((fetchedUsers || []).filter(u => u.userId !== currentUser.userId));
        } catch (error) {
          console.error('Error loading users', error);
        }
      };
      fetchUsers();

      // 2. Real-time Subscription to Messages (WhatsApp speed, no delays!)
      const unsubscribe = dbService.subscribeMessages((newMessages) => {
        setMessages(newMessages);
      });

      return () => {
        unsubscribe();
      };
    }
  }, [isChatOpen, currentUser.userId]);

  // Read state synchronization: Automatically mark received messages as read
  useEffect(() => {
    if (!isChatOpen || !selectedReceiverId) return;

    const unreadMsgs = messages.filter(
      msg => msg.senderId === selectedReceiverId && 
             msg.receiverId === currentUser.userId && 
             !msg.isRead
    );

    if (unreadMsgs.length > 0) {
      unreadMsgs.forEach(msg => {
        dbService.updateMessage(msg.id, { isRead: true }).catch(err => {
          console.error('Failed to mark message as read', err);
        });
      });
    }
  }, [messages, selectedReceiverId, isChatOpen, currentUser.userId]);

  // Listen to typing status of the active private chat partner
  useEffect(() => {
    if (!isChatOpen || !selectedReceiverId || selectedReceiverId === 'all') {
      setPartnerTyping(false);
      return;
    }

    const typingRef = doc(db, 'typing_states', selectedReceiverId);
    const unsub = onSnapshot(typingRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const isTyping = data.isTyping && data.typingTo === currentUser.userId;
        const isRecent = Date.now() - (data.updatedAt || 0) < 6000;
        setPartnerTyping(isTyping && isRecent);
      } else {
        setPartnerTyping(false);
      }
    }, (err) => {
      console.warn('Error listening to typing status:', err);
    });

    return () => {
      unsub();
    };
  }, [isChatOpen, selectedReceiverId, currentUser.userId]);

  // Scroll to bottom whenever messages or active chat room changes
  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, selectedReceiverId, isChatOpen, editingMessage]);

  // Handle own typing state updates in Firestore
  const handleInputChange = (val: string) => {
    setTypedMessage(val);

    if (!selectedReceiverId) return;

    // Set typing state in Firestore
    const myTypingRef = doc(db, 'typing_states', currentUser.userId);
    setDoc(myTypingRef, {
      isTyping: val.trim().length > 0,
      typingTo: selectedReceiverId,
      updatedAt: Date.now()
    }, { merge: true }).catch(err => {
      console.warn('Error updating typing status:', err);
    });

    // Reset typing state after 2.5 seconds of inactivity
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setDoc(myTypingRef, {
        isTyping: false,
        typingTo: '',
        updatedAt: Date.now()
      }, { merge: true }).catch(err => {
        console.warn('Error resetting typing status:', err);
      });
    }, 2500);
  };

  // Send WhatsApp message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !selectedReceiverId) return;

    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderId: currentUser.userId,
      senderName: currentUser.name,
      receiverId: selectedReceiverId,
      content: typedMessage.trim(),
      createdAt: new Date().toISOString(),
      isRead: false
    };

    if (replyingTo) {
      newMessage.replyToId = replyingTo.id;
      newMessage.replyToContent = replyingTo.content;
      newMessage.replyToSenderName = replyingTo.senderName;
      setReplyingTo(null);
    }

    // Optimistically prepend or append to avoid delay
    setMessages(prev => [...prev, newMessage]);
    setTypedMessage('');
    setShowAttachMenu(false);

    // Turn off typing in Firestore
    const myTypingRef = doc(db, 'typing_states', currentUser.userId);
    setDoc(myTypingRef, {
      isTyping: false,
      typingTo: '',
      updatedAt: Date.now()
    }, { merge: true }).catch(err => {
      console.warn('Error resetting typing status:', err);
    });

    try {
      await dbService.createMessage(newMessage);
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  // WhatsApp delete for everyone
  const handleDeleteMessage = async (msgId: string) => {
    setActiveMenuMessage(null);
    try {
      // Mark message as deleted instead of purging to keep history with "This message was deleted"
      await dbService.updateMessage(msgId, {
        isDeleted: true,
        content: 'This message was deleted'
      });
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  // Toggle pin state
  const handleTogglePin = async (msg: Message) => {
    const nextPinned = !msg.isPinned;
    setActiveMenuMessage(null);
    try {
      await dbService.updateMessage(msg.id, { 
        isPinned: nextPinned, 
        pinnedBy: nextPinned ? currentUser.userId : undefined 
      });
    } catch (err) {
      console.error('Failed to toggle pin state', err);
    }
  };

  // Save edit changes
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage || !editText.trim()) return;

    const trimmed = editText.trim();
    if (trimmed === editingMessage.content) {
      setEditingMessage(null);
      return;
    }

    const targetId = editingMessage.id;
    setEditingMessage(null);
    setEditText('');

    try {
      await dbService.updateMessage(targetId, { 
        content: trimmed, 
        isEdited: true 
      });
    } catch (err) {
      console.error('Failed to edit message', err);
    }
  };

  // Message Reaction handler
  const handleReactToMessage = async (msgId: string, emoji: string) => {
    setShowEmojiPickerForMsgId(null);
    try {
      const msg = messages.find(m => m.id === msgId);
      if (!msg || msg.isDeleted) return;

      const currentReactions = msg.reactions || {};
      const updatedReactions = { ...currentReactions };
      
      if (updatedReactions[currentUser.userId] === emoji) {
        delete updatedReactions[currentUser.userId];
      } else {
        updatedReactions[currentUser.userId] = emoji;
      }

      await dbService.updateMessage(msgId, { reactions: updatedReactions });
    } catch (err) {
      console.error('Failed to react to message', err);
    }
  };

  // Helper to scroll to a specific message and flash it
  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-4', 'ring-indigo-500/50', 'bg-indigo-50/50');
      setTimeout(() => {
        el.classList.remove('ring-4', 'ring-indigo-500/50', 'bg-indigo-50/50');
      }, 1500);
    }
  };

  // Filter visible messages for the active conversation
  const activeConversationMessages = messages.filter(msg => {
    if (selectedReceiverId === 'all') {
      return msg.receiverId === 'all';
    } else {
      return (
        (msg.senderId === currentUser.userId && msg.receiverId === selectedReceiverId) ||
        (msg.senderId === selectedReceiverId && msg.receiverId === currentUser.userId)
      );
    }
  });

  // Apply search filtering on messages inside the active room
  const filteredMessagesInRoom = activeConversationMessages.filter(msg => {
    if (!messageSearchQuery.trim()) return true;
    return msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase());
  });

  // Calculate unread count for a specific user
  const getUnreadCount = (partnerId: string) => {
    return messages.filter(
      msg => msg.senderId === partnerId && 
             msg.receiverId === currentUser.userId && 
             !msg.isRead
    ).length;
  };

  // Get last message in a chat conversation for sidebar preview
  const getLastMessage = (partnerId: string) => {
    const chatMsgs = messages.filter(msg => {
      if (partnerId === 'all') {
        return msg.receiverId === 'all';
      } else {
        return (
          (msg.senderId === currentUser.userId && msg.receiverId === partnerId) ||
          (msg.senderId === partnerId && msg.receiverId === currentUser.userId)
        );
      }
    });
    return chatMsgs[chatMsgs.length - 1];
  };

  // Pinned messages for active room
  const pinnedInRoom = activeConversationMessages.filter(msg => msg.isPinned);
  const activePinnedMessage = pinnedInRoom[pinnedInRoom.length - 1];

  // Search filtered contacts
  const filteredContacts = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q);
  });

  // Format timestamp nicely for sidebar
  const formatSidebarTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Get header display name
  const getHeaderDisplayName = () => {
    if (selectedReceiverId === 'all') return 'Everyone (General Group)';
    const user = users.find(u => u.userId === selectedReceiverId);
    return user ? user.name : `@${selectedReceiverId}`;
  };

  // Reaction picker choices
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  return (
    <div id="whatsapp-system-widget" className="relative">
      <AnimatePresence>
        {isChatOpen && (
          <>
            {/* Main Overlay Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-40 backdrop-blur-xs"
              onClick={() => handleSetOpen(false)}
            />

            {/* WhatsApp Dialog Window */}
            <motion.div 
              id="whatsapp-messenger-card"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-2 sm:inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 md:w-[850px] md:h-[600px] md:max-w-[95vw] md:max-h-[90vh] bg-gray-100 rounded-2xl shadow-2xl flex overflow-hidden"
            >
            {/* 1. LEFT SIDEBAR (Chats Directory) */}
            <div 
              className={`w-full md:w-[320px] bg-white border-r border-gray-200 flex flex-col shrink-0 ${
                selectedReceiverId !== null ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Sidebar Header */}
              <div className="bg-slate-50 px-4 py-3.5 flex items-center justify-between border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 bg-indigo-600 rounded-full flex items-center justify-center text-white font-extrabold text-sm border-2 border-white shadow-sm">
                    {currentUser.name[0].toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-gray-800 leading-tight">My Chat Space</span>
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">@{currentUser.userId}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSetOpen(false)}
                  className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-250 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Sidebar Search Bar */}
              <div className="bg-white p-2.5 border-b border-gray-150 shrink-0">
                <div className="relative flex items-center bg-slate-100 rounded-lg px-3 py-1.5 border border-transparent focus-within:border-indigo-500 transition-colors">
                  <Search className="h-4 w-4 text-gray-500 mr-2.5 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search or start new chat..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none text-xs focus:outline-none placeholder-gray-500 text-gray-800 font-medium"
                  />
                </div>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 bg-white">
                {/* General Group Chat */}
                <button
                  onClick={() => setSelectedReceiverId('all')}
                  className={`w-full px-4 py-3 flex items-start gap-3 transition-all cursor-pointer text-left ${
                    selectedReceiverId === 'all' 
                      ? 'bg-indigo-50/70 border-l-2 border-indigo-600' 
                      : 'hover:bg-slate-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="h-11 w-11 bg-indigo-600 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-gray-900 truncate">General Group Chat</span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {formatSidebarTime(getLastMessage('all')?.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-gray-500 truncate font-semibold">
                        {(() => {
                           const lastMsg = getLastMessage('all');
                           if (!lastMsg) return 'No messages yet';
                           return `${lastMsg.senderId === currentUser.userId ? 'You' : `@${lastMsg.senderId}`}: ${lastMsg.content}`;
                        })()}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Private Chats */}
                {filteredContacts.map(u => {
                  const lastMsg = getLastMessage(u.userId);
                  const unreadCount = getUnreadCount(u.userId);
                  const isSelected = selectedReceiverId === u.userId;

                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedReceiverId(u.userId)}
                      className={`w-full px-4 py-3 flex items-start gap-3 transition-all cursor-pointer text-left ${
                        isSelected 
                          ? 'bg-indigo-50/70 border-l-2 border-indigo-600' 
                          : 'hover:bg-slate-50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="h-11 w-11 bg-gray-200 border border-gray-300 rounded-full flex items-center justify-center text-gray-600 shrink-0 font-black text-sm uppercase shadow-sm">
                        {u.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900 truncate">{u.name}</span>
                          <span className={`text-[10px] font-mono ${unreadCount > 0 ? 'text-indigo-600 font-extrabold' : 'text-gray-500'}`}>
                            {formatSidebarTime(lastMsg?.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className={`text-[11px] truncate flex-1 pr-1 ${unreadCount > 0 ? 'text-gray-900 font-extrabold' : 'text-gray-500 font-semibold'}`}>
                            {lastMsg ? lastMsg.content : 'No chats yet'}
                          </p>
                          {unreadCount > 0 && (
                            <span className="h-4.5 min-w-4.5 px-1 bg-indigo-600 rounded-full flex items-center justify-center text-[9px] text-white font-extrabold shrink-0">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {filteredContacts.length === 0 && searchQuery.trim() && (
                  <div className="p-6 text-center text-gray-500 text-xs font-bold">
                    No contacts found matching "{searchQuery}"
                  </div>
                )}
              </div>

              {/* User Roles info footer */}
              <div className="p-3 bg-slate-50 border-t border-gray-200 text-center shrink-0">
                <span className="text-[9px] text-gray-500 uppercase font-extrabold tracking-wider">
                  Role: <span className="text-indigo-600">{currentUser.role}</span> System
                </span>
              </div>
            </div>

            {/* 2. RIGHT CHAT ROOM PANE */}
            <div 
              className={`flex-1 flex flex-col bg-white relative min-w-0 ${
                selectedReceiverId === null ? 'hidden md:flex' : 'flex'
              }`}
            >
              {selectedReceiverId ? (
                <>
                  {/* Active Chat Header */}
                  <div className="bg-slate-50 px-3 py-2 md:px-4 md:py-2.5 flex items-center justify-between border-b border-gray-200 shrink-0 shadow-sm relative z-10 min-w-0">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1 pr-1.5">
                      {/* Back Button (Mobile only) */}
                      <button
                        onClick={() => setSelectedReceiverId(null)}
                        className="md:hidden text-gray-600 p-1 hover:bg-gray-200 rounded-full mr-0.5 shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </button>

                      <div className="h-9 w-9 md:h-10 md:w-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-xs md:text-sm shadow-inner shrink-0 uppercase">
                        {selectedReceiverId === 'all' ? (
                          <Users className="h-4.5 w-4.5 md:h-5 md:w-5" />
                        ) : (
                          getHeaderDisplayName()[0]
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-extrabold text-gray-900 truncate">
                          {getHeaderDisplayName()}
                        </span>
                        <span className="text-[9px] text-gray-500 font-bold truncate flex items-center gap-1">
                          {partnerTyping ? (
                            <span className="text-indigo-600 font-extrabold animate-pulse">typing...</span>
                          ) : selectedReceiverId === 'all' ? (
                            'Active Group'
                          ) : (
                            'Online'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Header Action Icons */}
                    <div className="flex items-center gap-1.5 md:gap-3.5 text-gray-600 shrink-0">
                      <button 
                        onClick={() => setIsMessageSearchOpen(!isMessageSearchOpen)}
                        className={`p-1.5 hover:bg-gray-200 rounded-full transition-colors cursor-pointer ${isMessageSearchOpen ? 'text-indigo-600 bg-indigo-50' : ''}`}
                        title="Search messages"
                      >
                        <Search className="h-4 w-4 md:h-4.5 md:w-4.5" />
                      </button>
                      <button className="hidden sm:block p-1.5 hover:bg-gray-200 rounded-full transition-colors shrink-0 opacity-70 cursor-not-allowed">
                        <Phone className="h-4 w-4 md:h-4.5 md:w-4.5" />
                      </button>
                      <button className="hidden sm:block p-1.5 hover:bg-gray-200 rounded-full transition-colors shrink-0 opacity-70 cursor-not-allowed">
                        <Video className="h-4 w-4 md:h-4.5 md:w-4.5" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-200 rounded-full transition-colors shrink-0 opacity-80 cursor-pointer">
                        <MoreVertical className="h-4 w-4 md:h-4.5 md:w-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Message Search Bar inside Chat Room (WhatsApp feature!) */}
                  {isMessageSearchOpen && (
                    <div className="bg-[#f0f2f5] px-4 py-2 flex items-center border-b border-gray-200 shrink-0 shadow-inner z-10 animate-in slide-in-from-top duration-150">
                      <div className="relative flex items-center bg-white rounded-lg px-3 py-1.5 border border-gray-300 w-full">
                        <Search className="h-3.5 w-3.5 text-gray-500 mr-2 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search text in this chat..."
                          value={messageSearchQuery}
                          onChange={(e) => setMessageSearchQuery(e.target.value)}
                          className="w-full bg-transparent border-none text-xs focus:outline-none placeholder-gray-400 text-gray-800 font-semibold"
                          autoFocus
                        />
                        {messageSearchQuery && (
                          <button 
                            onClick={() => setMessageSearchQuery('')}
                            className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setIsMessageSearchOpen(false);
                          setMessageSearchQuery('');
                        }}
                        className="ml-3 text-xs font-bold text-indigo-700 hover:text-indigo-900 shrink-0 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  )}

                  {/* Pinned message bar inside active room */}
                  {activePinnedMessage && (
                    <div 
                      onClick={() => scrollToMessage(activePinnedMessage.id)}
                      className="bg-amber-50 hover:bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors shrink-0 z-10"
                      title="Click to jump to pinned message"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Pin className="h-4 w-4 text-amber-600 shrink-0 rotate-45" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-black text-amber-800 uppercase block tracking-wider">Pinned Message</span>
                          <span className="text-xs text-amber-900 truncate block font-semibold leading-tight">
                            {activePinnedMessage.content}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-700 font-extrabold uppercase shrink-0 bg-amber-200 px-2 py-0.5 rounded shadow-2xs">Jump</span>
                    </div>
                  )}

                  {/* Messages Area Container */}
                  <div 
                    ref={chatAreaRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 relative flex flex-col bg-slate-50"
                  >
                    {filteredMessagesInRoom.length > 0 ? (
                      filteredMessagesInRoom.map((msg, index, arr) => {
                        const isMe = msg.senderId === currentUser.userId;
                        
                        // Decide whether to show date header separator (e.g. "Today")
                        const msgDateStr = new Date(msg.createdAt).toDateString();
                        const prevMsg = index > 0 ? arr[index - 1] : null;
                        const showDateHeader = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== msgDateStr;

                        const todayStr = new Date().toDateString();
                        const yesterdayStr = new Date(Date.now() - 24*3600*1000).toDateString();
                        
                        let dateLabel = msgDateStr;
                        if (msgDateStr === todayStr) dateLabel = 'TODAY';
                        else if (msgDateStr === yesterdayStr) dateLabel = 'YESTERDAY';

                        return (
                          <div key={msg.id} className="flex flex-col w-full">
                            {/* Date Header Separator */}
                            {showDateHeader && (
                              <div className="self-center my-3.5 bg-white/90 border border-gray-250 shadow-2xs text-[10px] font-black tracking-wider text-gray-600 uppercase px-3 py-1 rounded-md">
                                {dateLabel}
                              </div>
                            )}

                            {/* Message Bubble Structure */}
                            <div 
                              id={`chat-msg-${msg.id}`}
                              className={`flex flex-col max-w-[80%] relative group transition-all rounded-xl ${
                                isMe ? 'self-end items-end' : 'self-start items-start'
                              }`}
                            >
                              {/* Sender Identity (Only in Group Chat and if not me) */}
                              {!isMe && selectedReceiverId === 'all' && (
                                <span className="text-[10px] text-indigo-600 font-black mb-0.5 ml-1 flex items-center gap-1">
                                  @{msg.senderId} ({msg.senderName})
                                </span>
                              )}

                              {/* Quoted Message display block (WhatsApp Reply preview inside bubble) */}
                              {msg.replyToId && (
                                <div 
                                  onClick={() => scrollToMessage(msg.replyToId!)}
                                  className={`w-full border-l-4 rounded-t-lg px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors mb-[-4px] select-none text-left ${
                                    isMe 
                                      ? 'bg-indigo-700/50 border-indigo-300 text-indigo-100 hover:bg-indigo-700/70' 
                                      : 'bg-slate-200/60 border-slate-400 text-slate-700 hover:bg-slate-200/80'
                                  }`}
                                >
                                  <div className={`font-extrabold text-[9px] truncate ${
                                    isMe ? 'text-indigo-200' : 'text-indigo-600'
                                  }`}>
                                    @{msg.replyToSenderName === currentUser.name ? 'You' : msg.replyToSenderName}
                                  </div>
                                  <div className="truncate italic">"{msg.replyToContent}"</div>
                                </div>
                              )}

                              {/* Speech Bubble */}
                              <div
                                className={`p-2.5 shadow-xs relative transition-all duration-150 select-none text-left min-w-[80px] ${
                                  msg.replyToId ? 'rounded-b-2xl rounded-none' : 'rounded-2xl'
                                } ${
                                  isMe
                                    ? 'bg-black text-white rounded-tr-none border border-black'
                                    : 'bg-white text-slate-800 rounded-tl-none border border-slate-200/60'
                                } ${msg.isPinned ? 'ring-2 ring-amber-400' : ''}`}
                              >
                                {/* Message Body Content */}
                                <p className={`text-sm break-words leading-relaxed ${
                                  msg.isDeleted 
                                    ? (isMe ? 'text-zinc-400 italic font-medium' : 'text-slate-400 italic font-medium') 
                                    : (isMe ? 'text-white font-medium' : 'text-slate-800 font-medium')
                                }`}>
                                  {msg.content}
                                </p>

                                {/* Message Footer: Time + Ticks */}
                                <div className={`flex items-center justify-end gap-1 mt-1 text-[8px] font-mono float-right leading-none ml-6 select-none ${
                                  isMe ? 'text-zinc-400' : 'text-slate-500'
                                }`}>
                                  <span>
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </span>
                                  {msg.isEdited && !msg.isDeleted && (
                                    <span className={isMe ? 'text-zinc-400 italic font-sans font-medium' : 'text-slate-400 italic font-sans font-medium'}>(edited)</span>
                                  )}
                                  
                                  {/* Ticks Status */}
                                  {isMe && !msg.isDeleted && (
                                    <span title={msg.isRead ? "Read (Double check)" : "Sent (Single check)"}>
                                      {msg.isRead ? (
                                        <CheckCheck className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                                      ) : (
                                        <Check className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                      )}
                                    </span>
                                  )}
                                </div>

                                {/* Message Reactions Mini Badge */}
                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                  <div className="absolute -bottom-2 right-2 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1.5 py-0.5 shadow-2xs text-[9px] select-none z-10">
                                    {Object.entries(msg.reactions).slice(0, 3).map(([uid, emo]) => (
                                      <span key={uid} title={`Reacted by ${uid}`}>
                                        {emo}
                                      </span>
                                    ))}
                                    {Object.keys(msg.reactions).length > 1 && (
                                      <span className="text-[8px] text-gray-500 font-extrabold pl-0.5">
                                        {Object.keys(msg.reactions).length}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Hover Desktop Action Buttons (WhatsApp style) */}
                                {!msg.isDeleted && (
                                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center bg-[#f0f2f5]/90 border border-gray-200 rounded-lg p-0.5 shadow-xs transition-opacity space-x-1 z-20">
                                    {/* Reaction Trigger */}
                                    <button
                                      type="button"
                                      onClick={() => setShowEmojiPickerForMsgId(showEmojiPickerForMsgId === msg.id ? null : msg.id)}
                                      className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors cursor-pointer"
                                      title="React"
                                    >
                                      <Smile className="h-3 w-3" />
                                    </button>

                                    {/* Reply Trigger */}
                                    <button
                                      type="button"
                                      onClick={() => setReplyingTo(msg)}
                                      className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors cursor-pointer"
                                      title="Reply"
                                    >
                                      <CornerUpLeft className="h-3 w-3" />
                                    </button>

                                    {/* Options Trigger */}
                                    <button
                                      type="button"
                                      onClick={() => setActiveMenuMessage(msg)}
                                      className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors cursor-pointer"
                                      title="More"
                                    >
                                      <MoreVertical className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Desktop Emoji picker float toolbar */}
                              {showEmojiPickerForMsgId === msg.id && (
                                <div className="absolute bottom-full mb-1 z-30 bg-white border border-gray-200 shadow-xl rounded-full p-1.5 flex items-center gap-1.5 animate-in zoom-in-90 duration-150">
                                  {emojis.map(emo => (
                                    <button
                                      key={emo}
                                      onClick={() => handleReactToMessage(msg.id, emo)}
                                      className="hover:scale-130 transition-transform p-1 text-sm shrink-0 cursor-pointer"
                                    >
                                      {emo}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
                        <MessageSquare className="h-10 w-10 text-gray-400" />
                        <div>
                          <p className="text-sm font-extrabold text-gray-700">
                            {selectedReceiverId === 'all'
                              ? 'Welcome to the Group Ledger Chat!'
                              : `Start a direct WhatsApp line with @${selectedReceiverId}`}
                          </p>
                          <p className="text-[11px] text-gray-500 font-bold max-w-xs mt-1">
                            {selectedReceiverId === 'all'
                              ? 'Send instant updates, files or questions to all managers in real-time!'
                              : 'Private message line is fully synchronized and instant.'}
                          </p>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Active replying quote indicator above input form */}
                  {replyingTo && (
                    <div className="bg-white px-4 py-2 flex items-center justify-between border-t border-gray-250 shrink-0 z-10 shadow-xs animate-in slide-in-from-bottom duration-150">
                      <div className="border-l-4 border-indigo-600 pl-3 min-w-0">
                        <span className="text-[10px] font-black text-indigo-700 block">
                          Replying to @{replyingTo.senderId}
                        </span>
                        <p className="text-xs text-gray-600 truncate italic font-medium mt-0.5">
                          "{replyingTo.content}"
                        </p>
                      </div>
                      <button
                        onClick={() => setReplyingTo(null)}
                        className="text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 p-1 rounded-full transition-all cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Simulated Attachments Drawer Menu */}
                  {showAttachMenu && (
                    <div className="absolute bottom-[60px] left-2 right-2 sm:left-4 sm:right-auto bg-white border border-gray-200 rounded-xl p-3 shadow-2xl flex flex-col gap-2.5 z-30 animate-in slide-in-from-bottom-5 duration-200">
                      <button 
                        onClick={() => { handleInputChange('Attached Ledger Document.pdf'); setShowAttachMenu(false); }}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 rounded-lg text-left cursor-pointer transition-colors"
                      >
                        <span className="p-1.5 bg-blue-100 rounded-full text-blue-600"><FileText className="h-3.5 w-3.5" /></span>
                        <span className="text-[11px] font-bold text-gray-700">Send PDF Report</span>
                      </button>
                      <button 
                        onClick={() => { handleInputChange('Captured Voucher Receipt.jpg'); setShowAttachMenu(false); }}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 rounded-lg text-left cursor-pointer transition-colors"
                      >
                        <span className="p-1.5 bg-red-100 rounded-full text-red-600"><Image className="h-3.5 w-3.5" /></span>
                        <span className="text-[11px] font-bold text-gray-700">Send Photo Receipt</span>
                      </button>
                      <button 
                        onClick={() => { handleInputChange('Office Location coordinates'); setShowAttachMenu(false); }}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 rounded-lg text-left cursor-pointer transition-colors"
                      >
                        <span className="p-1.5 bg-emerald-100 rounded-full text-emerald-600"><MapPin className="h-3.5 w-3.5" /></span>
                        <span className="text-[11px] font-bold text-gray-700">Share Office Location</span>
                      </button>
                    </div>
                  )}

                  {/* Chat Input & Submit Section */}
                  {editingMessage ? (
                    <form
                      onSubmit={handleSaveEdit}
                      className="p-3 border-t border-gray-200 bg-amber-50 flex flex-col gap-2 shrink-0 animate-in fade-in duration-200 z-10 min-w-0"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 px-1">
                        <span className="flex items-center gap-1">
                          <Edit3 className="h-3.5 w-3.5" />
                          Editing Message text
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessage(null);
                            setEditText('');
                          }}
                          className="text-gray-500 hover:text-gray-700 underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex gap-2 items-center min-w-0">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-gray-800 font-semibold min-w-0"
                          placeholder="Edit message..."
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!editText.trim() || editText.trim() === editingMessage.content}
                          className={`p-2.5 rounded-xl transition-all shrink-0 ${
                            editText.trim() && editText.trim() !== editingMessage.content
                              ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-95 shadow-sm'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-350'
                          }`}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form
                      onSubmit={handleSendMessage}
                      className="p-3 bg-slate-50 border-t border-gray-200 flex gap-2 shrink-0 items-center z-10 min-w-0"
                    >
                      {/* Attachment trigger */}
                      <button
                        type="button"
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className={`p-2 hover:bg-gray-200 rounded-full transition-colors shrink-0 cursor-pointer ${showAttachMenu ? 'text-indigo-600 bg-white shadow-xs' : 'text-gray-600'}`}
                        title="Simulate files attachment"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>

                      {/* Text Input */}
                      <input
                        type="text"
                        placeholder={
                          selectedReceiverId === 'all'
                            ? 'Message group...'
                            : 'Type message...'
                        }
                        value={typedMessage}
                        onChange={(e) => handleInputChange(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-800 placeholder-gray-400 font-semibold min-w-0"
                      />

                      {/* Submit Trigger */}
                      <button
                        type="submit"
                        disabled={!typedMessage.trim()}
                        className={`p-2.5 rounded-full transition-all shrink-0 ${
                          typedMessage.trim()
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95 shadow-sm'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                        }`}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </>
              ) : (
                /* Standby placeholder when no chat selected (on wide screens) */
                <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 p-8 text-center border-l border-gray-200">
                  <div className="max-w-md space-y-5 flex flex-col items-center justify-center">
                    <div className="h-24 w-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                      <MessageSquare className="h-12 w-12" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-black text-gray-800 tracking-tight">Vikram Prakalp Web Messenger</h2>
                      <p className="text-xs text-gray-500 font-bold max-w-sm mx-auto leading-relaxed">
                        Send and receive direct messages in real-time. Full-stack WhatsApp features are enabled with instant synchronization and typing indicators.
                      </p>
                    </div>
                    <button 
                      onClick={() => setSelectedReceiverId('all')}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-full transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      Open General Group Chat
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. MESSAGE OPTIONS DRAWER/ACTION SHEET (Pin, Edit, Delete for Everyone) */}
            {activeMenuMessage && (
              <div className="absolute inset-0 bg-black/40 z-50 animate-in fade-in duration-200 flex flex-col justify-end">
                {/* Click outside to close drawer */}
                <div className="absolute inset-0 -z-10" onClick={() => setActiveMenuMessage(null)} />
                
                <div className="bg-white rounded-t-2xl border-t border-gray-200 p-4 space-y-3.5 shadow-2xl animate-in slide-in-from-bottom duration-250 max-h-[80%] overflow-y-auto">
                  <div className="border-b border-gray-100 pb-2.5 text-left">
                    <div className="flex items-center justify-between text-gray-500 text-[9px] font-bold mb-1 uppercase tracking-wider">
                      <span>Message by @{activeMenuMessage.senderId}</span>
                      <span className="font-mono">
                        {new Date(activeMenuMessage.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-100 italic font-medium">
                      "{activeMenuMessage.content}"
                    </p>
                  </div>

                  {/* Options actions list */}
                  <div className="space-y-1">
                    {/* Reply quote */}
                    <button
                      onClick={() => {
                        setReplyingTo(activeMenuMessage);
                        setActiveMenuMessage(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                    >
                      <CornerUpLeft className="h-4 w-4 text-indigo-600" />
                      <span>Reply / Quote Message</span>
                    </button>

                    {/* Pin/Unpin */}
                    <button
                      onClick={() => handleTogglePin(activeMenuMessage)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                    >
                      {activeMenuMessage.isPinned ? (
                        <>
                          <PinOff className="h-4 w-4 text-amber-600" />
                          <span>Unpin Message</span>
                        </>
                      ) : (
                        <>
                          <Pin className="h-4 w-4 text-amber-600 rotate-45" />
                          <span>Pin Message to Top</span>
                        </>
                      )}
                    </button>

                    {/* Edit message text */}
                    {activeMenuMessage.senderId === currentUser.userId && (
                      <button
                        onClick={() => {
                          setEditingMessage(activeMenuMessage);
                          setEditText(activeMenuMessage.content);
                          setActiveMenuMessage(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                      >
                        <Edit3 className="h-4 w-4 text-blue-600" />
                        <span>Edit Message text</span>
                      </button>
                    )}

                    {/* Delete for everyone (Only available to sender or admins/super admin roles) */}
                    {(activeMenuMessage.senderId === currentUser.userId || currentUser.role === 'Admin' || currentUser.role === 'Super Admin') && (
                      <button
                        onClick={() => handleDeleteMessage(activeMenuMessage.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-extrabold text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
                      >
                        <Trash className="h-4 w-4" />
                        <span>Delete for Everyone (WhatsApp)</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setActiveMenuMessage(null)}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
