<!-- lib/components/DebugPanel.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { debugService, type LogEntry } from '$lib/services/DebugService.js';
  
  let logs: LogEntry[] = [];
  let visible = false;
  let expanded = false;
  
  let unsubscribe: (() => void) | undefined;
  
  onMount(() => {
    // S'abonner aux logs
    unsubscribe = debugService.subscribe(newLogs => {
      logs = newLogs;
    });
    
    // Log de démarrage
    debugService.info('Debug panel initialized');
    
    // Activer par défaut en développement
    visible = true;
  });
  
  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
  
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0];
  }
  
  function getColorClass(level: string): string {
    switch (level) {
      case 'error': return 'bg-red-900 text-white';
      case 'warn': return 'bg-yellow-800 text-white';
      case 'info': return 'bg-blue-800 text-white';
      default: return 'bg-gray-800 text-white';
    }
  }
</script>

<div class="fixed bottom-0 right-0 z-50">
  <button 
    class="bg-gray-800 text-white px-2 py-1 text-sm rounded-tl-md"
    on:click={() => visible = !visible}
  >
    {visible ? 'Hide' : 'Show'} Debug ({logs.length})
  </button>
  
  {#if visible}
    <div 
      class="bg-black bg-opacity-90 text-white rounded-tl-md overflow-y-auto border border-gray-700"
      class:w-full={expanded}
      class:max-w-md={!expanded}
      style="max-height: {expanded ? '80vh' : '30vh'};"
    >
      <div class="flex justify-between items-center p-2 border-b border-gray-700">
        <button 
          class="bg-red-700 text-white text-xs px-2 py-1 rounded"
          on:click={() => debugService.clear()}
        >
          Clear
        </button>
        
        <button 
          class="bg-gray-700 text-white text-xs px-2 py-1 rounded"
          on:click={() => expanded = !expanded}
        >
          {expanded ? 'Réduire' : 'Agrandir'}
        </button>
      </div>
      
      <div class="p-2 space-y-1 font-mono text-xs">
        {#each logs as log}
          <div class="flex flex-col p-1 mb-1 rounded {getColorClass(log.level)}">
            <div class="flex justify-between">
              <span class="font-bold">[{log.level.toUpperCase()}]</span>
              <span class="text-gray-300 text-opacity-80">{formatTime(log.timestamp)}</span>
            </div>
            <div class="break-words whitespace-pre-wrap">{log.message}</div>
          </div>
        {/each}
        
        {#if logs.length === 0}
          <div class="text-gray-500 italic">No logs</div>
        {/if}
      </div>
    </div>
  {/if}
</div>