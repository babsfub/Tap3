<!-- lib/components/TransactionHistory.svelte -->
<script lang="ts">
    import type { TransactionRecord } from '$lib/types.js';

    
  
    let props = $props<{
      transactions: TransactionRecord[];
    }>();
  </script>
  
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <h2 class="text-xl font-bold mb-4">Transaction History</h2>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="text-left border-b dark:border-gray-700">
            <th class="p-2">Date</th>
            <th class="p-2">To</th>
            <th class="p-2 text-right">Amount</th>
            <th class="p-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each props.transactions as tx}
            <tr class="border-b dark:border-gray-700">
              <td class="p-2">
                {new Date(tx.timestamp).toLocaleDateString()}
              </td>
              <td class="p-2 font-mono">
                {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
              </td>
              <td class="p-2 text-right">
                {tx.amount} MATIC
              </td>
              <td class="p-2 text-right">
                <span class="px-2 py-1 rounded-full text-sm" class:bg-green-100={tx.status === 'confirmed'} class:bg-red-100={tx.status === 'failed'} class:bg-yellow-100={tx.status === 'pending'}>
                  {tx.status}
                </span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>