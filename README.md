# Push-optimal Sokoban solver

`main.ts` parses each XSB level, cuts the dead part of the hallway, and solves each room independently with deterministic push-state A* using matching-distance heuristics, dead-square and frozen-2x2 pruning. It reconstructs player walks between pushes and writes one solution per instance.

Run locally with `MAKEFUN_INPUT_DIR=... MAKEFUN_OUTPUT_DIR=... node main.ts`.

Verified practice result: 1,000,000 points, with 13, 16, 29, 47 and 60 pushes for i001 through i005. The complete practice run takes about 0.5 seconds on this machine. Eight fresh generated sets were also measured during this run; all 40 instances were push-optimal (1,000,000 per set).
