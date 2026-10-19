## 2024-05-18 - fix medkit pickup carry limit bypass

**what was found:** medkits could not be picked up when the player's inventory was full, even if they had not reached their 2 item maximum carry limit, because the pickup command inventory check only allowed powercells to bypass the full inventory check.

**action:** modified the bypass check logic inside `resolvePickupCommand` to correctly allow medkits to bypass the strict `canAddToInventory` check if the inventory is full. medkits are special cased in `events.ts` to respect their own max carry limit (2), and they consume inventory slots if possible, but the command validation was too strict and treated them like normal unstackable items when evaluating if they could be picked up.

**prevention:** test emergency capped items alongside normal stackable items to ensure inventory limits apply correctly.
