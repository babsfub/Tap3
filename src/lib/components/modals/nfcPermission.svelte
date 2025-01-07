<!-- src/lib/components/modals/NFCPermission.svelte -->
<script lang="ts">
    import { browser } from '$app/environment';
    import { nfcService } from '$lib/services/nfc.js';
    import type { CardInfo } from '$lib/types.js';
    
    let props = $props<{
        mode: 'read' | 'write';
        onCardDetected?: (cardInfo: CardInfo) => void;
        onClose: () => void;
    }>();
    
    // États locaux
    let isNFCSupported = $state(false);
    let isCheckingNFC = $state(true);
    let error = $state<string | null>(null);
    let waitingForLink = $state(false);
    
    // Vérifier le support NFC au chargement
    async function checkNFCSupport() {
        if (!browser) return;
        
        try {
            isCheckingNFC = true;
            isNFCSupported = await nfcService.isSupported();
            
            if (isNFCSupported) {
                await startNFCReading();
            } else {
                waitingForLink = true;
            }
        } catch (err) {
            console.error('NFC check failed:', err);
            waitingForLink = true;
        } finally {
            isCheckingNFC = false;
        }
    }
    
    async function startNFCReading() {
        if (!browser || !isNFCSupported) return;
        
        try {
            await nfcService.startReading({
                onRead: (result) => {
                    if (result.isValid && props.onCardDetected) {
                        props.onCardDetected(result.cardInfo);
                    } else {
                        error = 'Invalid card detected';
                    }
                },
                onError: (err) => {
                    error = err.message;
                    waitingForLink = true;
                },
                onStateChange: (state) => {
                    isCheckingNFC = state === 'reading';
                },
                mode: props.mode
            });
        } catch (err) {
            console.error('NFC reading failed:', err);
            waitingForLink = true;
        }
    }
    
    function handleHashChange() {
        const hash = window.location.hash;
        if (hash && waitingForLink) {
            props.onClose();
        }
    }
    
    // Setup et cleanup
    $effect(() => {
        void checkNFCSupport();
        
        if (browser) {
            window.addEventListener('hashchange', handleHashChange);
            return () => {
                window.removeEventListener('hashchange', handleHashChange);
                void nfcService.stopReading();
            };
        }
    });
</script>

<div 
    class="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50"
    role="dialog" 
    aria-modal="true"
>
    <div class="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold dark:text-white">
                {props.mode === 'write' ? 'Write to Card' : 'Read Card'}
            </h2>
            
            <button 
                onclick={props.onClose}
                class="text-gray-500 hover:text-gray-700 dark:text-gray-400 
                       dark:hover:text-gray-300 transition-colors"
                aria-label="Close"
            >
                ×
            </button>
        </div>

        <div class="space-y-4">
            {#if isCheckingNFC}
                <div class="flex flex-col items-center gap-4 py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
                    <p class="text-gray-600 dark:text-gray-300">
                        Checking NFC availability...
                    </p>
                </div>
            {:else if error}
                <div class="bg-red-100 dark:bg-red-900/50 border border-red-400 p-4 rounded">
                    {error}
                </div>
            {:else if waitingForLink}
                <div class="text-center py-8">
                    <p class="text-gray-600 dark:text-gray-300 mb-4">
                        NFC not available. Please scan your card using the external NFC reader 
                        and visit the provided link.
                    </p>
                    <img 
                        src="/images/scan-card.svg" 
                        alt="Scan card illustration"
                        class="mx-auto mb-4 h-32 w-32" 
                    />
                </div>
            {:else}
                <div class="text-center py-8">
                    <p class="text-gray-600 dark:text-gray-300 mb-4">
                        Please hold your card near the device.
                    </p>
                    <img 
                        src="/images/tap-card.svg" 
                        alt="Tap card illustration" 
                        class="mx-auto mb-4 h-32 w-32"
                    />
                </div>
            {/if}
        </div>
    </div>
</div>