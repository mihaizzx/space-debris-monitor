Context and Summary
Use NASA DONKI data for space-weather context (Kp), which affects atmospheric density in LEO and maneuver/deorbit windows.
Use the NASA ODPO/ORDEM model for statistical debris fluxes (in demo: “ORDEM-like” CSV grid). For production, replace with real ORDEM 3.2/4.0.
TLEs come from CelesTrak (public) or Space-Track (account required). NASA does not provide a fully public TLE API for debris.

Workflow:

Load TLE → 2) Propagate orbit (SGP4) → 3) Query DONKI (Kp) → 4) Compute risk (flux + Poisson) → 5) Visualize in 3D → 6) (optional) Classify images with ML.

Data usage justification:

ORDEM (ODPO/NASA): the standard for risk assessment and ADR target prioritization.
DONKI: geomagnetic events influence drag → re-entry times and Δv.
TLE: necessary for collision avoidance and navigation (Space-Track/CelesTrak).