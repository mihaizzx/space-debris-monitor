# Context și rezumat

- Folosește date NASA DONKI pentru context space‑weather (Kp), care afectează densitatea atmosferică în LEO și ferestrele de manevră/deorbit.
- Folosește modelul NASA ODPO/ORDEM pentru fluxurile statistice de deșeuri (în demo: grid „ORDEM‑like” CSV). Pentru producție, înlocuiește cu ORDEM 3.2/4.0 real.
- TLE-urile vin din CelesTrak (public) sau Space-Track (cont). NASA nu oferă un API TLE public complet pentru debris.

Flux:
1) Încarci TLE → 2) Propagi orbita (SGP4) → 3) Interoghezi DONKI (Kp) → 4) Calculezi risc (flux + Poisson) → 5) Vizualizezi 3D → 6) (opțional) Clasifici imagini cu ML.

Justificare utilizare date:
- ORDEM (ODPO/NASA): standardul pentru evaluarea riscului și prioritzare ținte ADR.
- DONKI: evenimente geomagnetice influențează drag-ul → timpii de re-intrare și Δv.
- TLE: necesare pentru evitare coliziuni și navigație (Space-Track/CelesTrak).
