// src/app.d.ts
/// <reference types="svelte" />
/// <reference types="@sveltejs/kit" />
/// <reference types="w3c-web-nfc" />

declare namespace App {
	interface NFCWriterProps {
	  cardInfo: import('$lib/types').CardInfo;
	  onError?: (error: string) => void;
	  onSuccess?: () => void;
	}
  
	interface NFCReaderProps {
	  mode?: 'payment' | 'verify' | 'setup';
	  onRead?: (cardInfo: import('$lib/types').CardInfo) => void;
	  onError?: (error: string) => void;
	  onSuccess?: () => void;
	}
  }
  
  declare module '*.svelte' {
	import type { ComponentType } from 'svelte';
	const component: ComponentType;
	export default component;
  }
  
  declare module '$lib/components/NFCWriter.svelte' {
	export default class NFCWriter extends SvelteComponentTyped<App.NFCWriterProps> {}
  }
  
  declare module '$lib/components/NFCReader.svelte' {
	export default class NFCReader extends SvelteComponentTyped<App.NFCReaderProps> {}
  }