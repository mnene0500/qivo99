
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, User, Maximize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { endCallAction } from '@/app/actions/call-actions';
import { cn } from '@/lib/utils';

/**
 * @fileOverview Global Ringing Listener and Active Call PIP UI.
 */
export function GlobalCallOverlay() {
  const { user } = useUser();
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Listen for incoming calls
    const channel = supabase.channel(`incoming-calls-${user.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'calls', 
        filter: `receiver_id=eq.${user.id}` 
      }, async (payload) => {
        if (payload.new.status === 'calling') {
          const { data: p } = await supabase.from('users').select('*').eq('uid', payload.new.caller_id).single();
          setPartner(p);
          setIncomingCall(payload.new);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `receiver_id=eq.${user.id}`
      }, (payload) => {
        if (payload.new.status === 'ended') {
          setIncomingCall(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const handleAccept = () => {
    if (!incomingCall) return;
    router.push(`/call/${incomingCall.chat_id}?type=${incomingCall.type}&partnerId=${incomingCall.caller_id}&callId=${incomingCall.id}`);
    setIncomingCall(null);
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    await endCallAction(incomingCall.id, 'Rejected');
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
      <div className="w-full max-w-sm bg-white rounded-[3rem] p-10 flex flex-col items-center space-y-8 shadow-2xl scale-in-95">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
          <Avatar className="w-32 h-32 border-4 border-white shadow-xl relative z-10">
            <AvatarImage src={partner?.photo_url} className="object-cover" />
            <AvatarFallback><User className="w-16 h-16 text-gray-200" /></AvatarFallback>
          </Avatar>
        </div>
        
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-black tracking-tight">{partner?.name || 'Incoming Call'}</h2>
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">
            {incomingCall.type === 'video' ? 'Video Invitation' : 'Voice Invitation'}
          </p>
        </div>

        <div className="flex gap-4 w-full pt-4">
          <Button onClick={handleDecline} className="flex-1 h-20 rounded-3xl bg-red-50 text-red-500 font-black uppercase tracking-widest text-[10px] shadow-sm border-none active:scale-95">
             <PhoneOff className="w-6 h-6 mb-1 block mx-auto" /> Decline
          </Button>
          <Button onClick={handleAccept} className="flex-1 h-20 rounded-3xl bg-[#00A2FF] text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-200 border-none active:scale-95">
             <Phone className="w-6 h-6 mb-1 block mx-auto" /> Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
