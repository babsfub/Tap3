<!-- lib/components/DebugConsole.svelte -->
<script lang="ts">
  import { logger, logs, type LogEntry } from '$lib/services/logger.js';
  import { onMount } from 'svelte';
  
  let isVisible = false;
  let isExpanded = false;
  let filterLevel = 'all';
  
  // Fonction pour formatter l'heure
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  }
  
  // Filtrer les logs en fonction du niveau
  $: filteredLogs = $logs.filter((log: LogEntry) => 
    filterLevel === 'all' || log.level === filterLevel
  );
  
  // Classes de couleur pour chaque niveau de log
  function getLevelClass(level: string): string {
    switch(level) {
      case 'debug': return 'text-gray-500';
      case 'info': return 'text-blue-500';
      case 'warn': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return '';
    }
  }
  
  function toggleVisibility() {
    isVisible = !isVisible;
  }
  
  function toggleExpand() {
    isExpanded = !isExpanded;
  }
  
  function clearLogs() {
    logger.clear();
  }
  
  onMount(() => {
    // Activer automatiquement la console lors du développement
    isVisible = true;
    
    // Ajouter un log initial pour confirmer que la console fonctionne
    logger.info("Debug console initialized");
  });
</script>

<!-- Le reste du code reste inchangé... -->
  <div class="fixed bottom-0 right-0 z-50">
    <button 
      class="bg-gray-800 text-white px-3 py-1 rounded-tl-md"
      on:click={toggleVisibility}
    >
      {isVisible ? 'Cacher' : 'Debug'} 
    </button>
    
    {#if isVisible}
      <div class="bg-gray-900 text-white p-2 border border-gray-700 rounded-tl-md shadow-lg"
           class:w-full={isExpanded}
           class:max-w-md={!isExpanded}
           class:h-64={!isExpanded}
           class:h-screen={isExpanded}
           style="max-height: {isExpanded ? '80vh' : '40vh'}; overflow-y: auto;">
        
        <div class="flex justify-between items-center mb-2">
          <div class="flex space-x-2">
            <select 
              bind:value={filterLevel}
              class="bg-gray-800 text-white text-sm px-2 py-1 rounded"
            >
              <option value="all">Tous</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <button 
              class="bg-red-700 text-white text-xs px-2 py-1 rounded"
              on:click={clearLogs}
            >
              Clear
            </button>
          </div>
          <button 
            class="bg-gray-800 text-white text-xs px-2 py-1 rounded"
            on:click={toggleExpand}
          >
            {isExpanded ? 'Réduire' : 'Agrandir'}
          </button>
        </div>
        
        <div class="space-y-1 font-mono text-xs">
          {#each filteredLogs as log}
            <div class="border-b border-gray-800 pb-1">
              <span class="text-gray-400 text-2xs">{formatTime(log.timestamp)} </span>
              <span class={getLevelClass(log.level)}>[{log.level.toUpperCase()}]</span>
              <span class="text-white break-words">{log.message}</span>
            </div>
          {/each}
          
          {#if filteredLogs.length === 0}
            <div class="text-gray-500 italic">Aucun log</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  
  <style>
    .text-2xs {
      font-size: 0.65rem;
    }
  </style>