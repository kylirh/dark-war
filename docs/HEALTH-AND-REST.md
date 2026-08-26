# Health and rest

Resting is Dark War's normal recovery path. It is entered through `WAIT` when
the player is hurt and no hostile monster is within the player's viewing
distance. Rest restores one HP every 30 simulation ticks (1.5 seconds of
simulated time), players take double incoming damage while resting, and any
damage or wake command interrupts it. Waking immediately returns the simulation
to its normal time scale; the accelerated rest scale must never leak into the
player's next movement frame.

Medkits are emergency recovery, not a replacement for planning a safe rest:

- A medkit restores 10 HP, clamps at maximum health, is consumed on use, and
  cannot revive a dead player.
- A player can carry at most two medkits. Pickup respects the ordinary inventory
  capacity, and a rejected pickup remains on the ground with feedback.
- Offline surface play has no random medkit scatter. Dungeon levels 1, 4, 7,
  and so on receive one rare medkit; other dungeon levels receive none. The
  level-generation RNG determines its location, so the result is repeatable
  for a given generation seed.
- Online play keeps one medkit on each generated dungeon plane so a shared
  group retains access to emergency recovery.

Medkits created by death drops, saves, and network snapshots retain their item
data and follow the same two-medkit carry limit when picked up again.
