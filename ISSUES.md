# Issue: SafeDelay: Add 'Unlocked' filter to Active Contracts dashboard

## Priority: medium

## Problem

The SafeDelay Dashboard Active Contracts section has sorting options (date, amount, unlock) but no way to filter to only show unlocked contracts. Users must scan the full list to find which ones are ready to withdraw.

## Current Behavior

All contracts shown (locked + unlocked). Sorting by 'Unlock Date' helps but doesn't hide locked ones.

## Proposed Solution

Add a filter control (similar to the existing 'All Contracts' / 'My Wallets' wallet filter) to show only unlocked contracts.

**Implementation:**
- Add filter state: `contractFilter: 'all' | 'unlocked'` (default 'all')
- Persist to localStorage key `safedelay-contract-filter`
- Add filter buttons in the SortBar area:

```jsx
<FilterLabel>Contracts:</FilterLabel>
<FilterSelect value={contractFilter} onChange={...}>
  <option value="all">All Contracts</option>
  <option value="unlocked">Unlocked</option>
</FilterSelect>
```

- Apply filter before render:

```jsx
const displayContracts = contractFilter === 'unlocked'
  ? sortedContracts.filter(c => c.lockEndBlock <= c.currentBlock)
  : sortedContracts;
```

## Files to change

- `src/components/Dashboard.tsx` only

## Status: DONE ✓

Added `unlockedFilter` boolean state persisted to `safedelay-unlocked-filter`. When enabled, filters `filteredContracts` to only contracts where `lockEndBlock <= currentBlock`. Toggle button added in SortBar next to Sort dropdown.