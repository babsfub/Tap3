<!-- lib/components/TransactionHistory.svelte -->
<script lang="ts">
  import type { TransactionRecord } from '$lib/types.js';
  import Address from './Address.svelte';


  let props = $props<{
    transactions: TransactionRecord[];
  }>();


  
  function formatAmount(amount: string): string {
    const num = parseFloat(amount);
    return num.toFixed(Math.min(8, amount.split('.')[1]?.length || 0));
  }

  // Status colors et icons
  const statusConfig = {
    confirmed: {
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      textColor: 'text-green-800 dark:text-green-200',
      icon: '✓'
    },
    pending: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
      textColor: 'text-yellow-800 dark:text-yellow-200',
      icon: '⋯'
    },
    failed: {
      bgColor: 'bg-red-100 dark:bg-red-900/20',
      textColor: 'text-red-800 dark:text-red-200',
      icon: '✕'
    }
  };

  // Format de la date
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return date.toLocaleTimeString();
    }
    return date.toLocaleDateString(undefined, { 
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
<h2 class="text-xl font-bold mb-4 dark:text-white">Transaction History</h2>

{#if props.transactions.length === 0}
  <p class="text-center text-gray-500 dark:text-gray-400 py-8">
    No transactions yet
  </p>
{:else}
  <div class="overflow-x-auto">
    <table class="w-full">
      <thead>
        <tr class="text-left border-b dark:border-gray-700">
          <th class="p-2 text-gray-600 dark:text-gray-400">Time</th>
          <th class="p-2 text-gray-600 dark:text-gray-400">To</th>
          <th class="p-2 text-right text-gray-600 dark:text-gray-400">Amount</th>
          <th class="p-2 text-right text-gray-600 dark:text-gray-400">Status</th>
        </tr>
      </thead>
      <tbody>
        {#each props.transactions as tx (tx.hash)}
          <tr 
            class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <td class="p-2 whitespace-nowrap">
              <div class="text-sm">
                {formatDate(tx.timestamp)}
              </div>
            </td>
            <td class="p-2">
              <Address
                address={tx.to}
                copyable={true}
                showPrefix={true}
              />
            </td>
            <td class="p-2 text-right whitespace-nowrap">
              <span class="font-medium">
                {formatAmount(tx.amount)}
              </span>
              <span class="text-gray-500 dark:text-gray-400 ml-1">
                MATIC
              </span>
            </td>
            <td class="p-2 text-right">
              <span 
                class="inline-flex items-center px-2 py-1 rounded-full text-sm
                       {statusConfig[tx.status as keyof typeof statusConfig].bgColor}
                       {statusConfig[tx.status as keyof typeof statusConfig].textColor}"
              >
                <span class="mr-1">{statusConfig[tx.status as keyof typeof statusConfig].icon}</span>
                {tx.status}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
</div>