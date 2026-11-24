/**
 * Master Textbook Curriculum & Syllabus Data for FluidScope AI.
 * Structure matches "Introduction to Fluid Mechanics and Fluid Machines" (3rd Ed.)
 * by S.K. Som, G. Biswas, and S. Chakraborty.
 */

export const TEXTBOOK_CURRICULUM = [
  {
    chapter: 1,
    code: "CH01",
    title: "Introduction and Fundamental Concepts",
    status: "textbook",
    sections: [
      {
        num: "1.1",
        title: "A Broad Perspective of Fluid Mechanics",
        subtopics: ["Historical context", "Engineering applications", "Continuum vs particle dynamics"]
      },
      {
        num: "1.2",
        title: "Definition of a Fluid",
        subtopics: ["Continuous deformation under shear", "Rate of deformation", "Zero shear stress at rest"]
      },
      {
        num: "1.3",
        title: "Distinction between a Solid and a Fluid",
        subtopics: ["Intermolecular forces and lattice spacing", "Finite shear strain vs continuous deformation rate", "Elastic recovery vs viscous flow"]
      },
      {
        num: "1.4",
        title: "Macroscopic and Microscopic Points of View: The Concept of a Continuum",
        subtopics: [
          "Knudsen number regimes (Continuum, Slip, Transition, Free Molecular)",
          "Representative Elementary Volume (REV)",
          "Locally averaged macroscopic properties"
        ]
      },
      {
        num: "1.5",
        title: "Concepts of Pressure and Stress in a Fluid",
        subtopics: [
          "Body forces and surface forces",
          "Cartesian stress tensor (9 components: normal and shear)",
          "Hydrostatic state of stress",
          "Isotropy of pressure (Pascal's law / Cauchy tetrahedron)"
        ]
      },
      {
        num: "1.6",
        title: "Fluid Properties",
        subtopics: [
          "Specific volume (v) and mass density (rho)",
          "Specific weight (gamma) and specific gravity (s)",
          "Dynamic viscosity (mu) and Newton's law of viscosity",
          "Kinematic viscosity (nu)",
          "No-slip boundary condition at physical walls",
          "Non-Newtonian behavior: Bingham plastics, Pseudoplastics, Dilatants, Thixotropic and Rheopectic fluids",
          "Bulk modulus (K) and fluid compressibility (beta)",
          "Distinction between incompressible and compressible flow (Mach threshold Ma < 0.3)",
          "Interfacial phenomenon and surface tension (sigma)",
          "Young-Laplace relation (droplet, soap bubble, liquid jet)",
          "Capillary rise, depression, and meniscus contact angle",
          "Vapour pressure, saturation boiling, and cavitation onset"
        ]
      }
    ]
  },
  {
    chapter: 2,
    code: "CH02",
    title: "Fluids Under Rest and Rigid Body Motion",
    status: "active",
    labs: ["2C", "4D"],
    sections: [
      {
        num: "2.1",
        title: "Introduction to Fluid Statics",
        subtopics: ["Absence of shear stress", "Hydrostatic pressure distribution"]
      },
      {
        num: "2.2",
        title: "Fundamental Equation of Fluids at Rest",
        subtopics: ["Hydrostatic gradient dp/dz = -rho*g", "Incompressible and compressible fluid columns"]
      },
      {
        num: "2.3",
        title: "Units and Scales of Pressure Measurement",
        subtopics: ["Absolute, gauge, and vacuum pressure", "Atmospheric reference"]
      },
      {
        num: "2.4",
        title: "Barometers and Absolute Pressure",
        subtopics: ["Torricellian vacuum and mercury columns", "Vapour pressure correction"]
      },
      {
        num: "2.5",
        title: "Manometry",
        subtopics: ["Piezometer tubes", "U-tube manometers", "Differential and inclined manometers"]
      },
      {
        num: "2.6",
        title: "Hydrostatic Thrusts on Submerged Surfaces",
        subtopics: ["Planar surfaces and center of pressure", "Curved surfaces: horizontal and vertical pressure integration"]
      },
      {
        num: "2.7",
        title: "Buoyancy",
        subtopics: ["Archimedes' principle", "Center of buoyancy and displaced volume"]
      },
      {
        num: "2.8",
        title: "Stability of Submerged and Floating Bodies",
        subtopics: ["Metacenter and metacentric height (GM)", "Righting and overturning couples", "Stable, neutral, and unstable equilibrium criteria"]
      },
      {
        num: "2.9",
        title: "Fluids under Rigid Body Motion (Relative Equilibrium)",
        subtopics: [
          "Uniform linear acceleration in horizontal and vertical directions",
          "Rotating open cylindrical vessel (liquid paraboloid, rim overflow, dry floor uncovering)",
          "Effective gravity in free fall (g_eff = 0) halting hydrostatic efflux"
        ],
        labs: [
          { code: "2C", bay: "02", sub: "vessel", title: "Rotating Open Vessel & Base Uncovering" },
          { code: "4D", bay: "04", sub: "tank", title: "Accelerating & Free-Falling Tank Hydrostatics" }
        ]
      }
    ]
  },
  {
    chapter: 3,
    code: "CH03",
    title: "Kinematics of Fluid Flow",
    status: "active",
    labs: ["2A"],
    sections: [
      {
        num: "3.1",
        title: "Introduction to Kinematics",
        subtopics: ["Lagrangian tracking vs Eulerian field description"]
      },
      {
        num: "3.2",
        title: "Scalar and Vector Fields",
        subtopics: ["Velocity vector field", "Material derivative and total acceleration: local vs convective components"]
      },
      {
        num: "3.3",
        title: "Flow Field and Description of Fluid Motion",
        subtopics: [
          "Streamlines, pathlines, and streaklines divergence in unsteady fields",
          "Fluid element translation, linear deformation, shear strain, and rotation",
          "Vorticity vector (Omega = curl V) and circulation (Stokes' theorem)"
        ],
        labs: [
          { code: "2A", bay: "02", sub: "kinematics", title: "Unsteady Kinematics & Stokes' Circulation Check" }
        ]
      },
      {
        num: "3.4",
        title: "Conservation of Mass for Fluid Flow",
        subtopics: ["Differential continuity equation in Cartesian and cylindrical coordinates", "Incompressible divergence-free velocity field"]
      },
      {
        num: "3.5",
        title: "Stream Function",
        subtopics: ["2D Lagrange stream function (psi)", "Volumetric discharge between streamlines", "Cauchy-Riemann connections"]
      },
      {
        num: "3.6",
        title: "Velocity Potential",
        subtopics: ["Irrotational flow and potential field (phi)", "Laplace equation for potential flow", "Orthogonality of streamlines and equipotential lines"]
      }
    ]
  },
  {
    chapter: 4,
    code: "CH04",
    title: "Dynamics of Inviscid Flows: Fundamentals and Applications",
    status: "active",
    labs: ["2B"],
    sections: [
      {
        num: "4.1",
        title: "Introduction to Inviscid Dynamics",
        subtopics: ["Inviscid idealization", "Absence of shear stresses"]
      },
      {
        num: "4.2",
        title: "Euler's Equation of Motion in Cartesian Coordinates",
        subtopics: ["Differential momentum balance on inviscid elements", "Pressure gradient and body force equilibrium"]
      },
      {
        num: "4.3",
        title: "Pressure Differential between Two Points in an Inviscid Flow Field",
        subtopics: ["Integration of Euler equations", "Bernoulli equation derivation"]
      },
      {
        num: "4.4",
        title: "Euler's Equation in Streamline Coordinate System",
        subtopics: [
          "Along-streamline momentum: p + 0.5*rho*V^2 + rho*g*z = const",
          "Cross-streamline normal equilibrium: dp/dn = rho*V^2 / R",
          "Cross-streamline mechanical head gradient: dH/dn = (V/g) * Omega_z"
        ]
      },
      {
        num: "4.5",
        title: "Mechanical Energy Conservation and Vortex Flows",
        subtopics: [
          "Free (irrotational) vortex (v_theta proportional to 1/r)",
          "Forced (rotational solid-body) vortex (v_theta = omega*r)",
          "Rankine combined vortex core",
          "Why Bernoulli across rotational streamlines fails (radial Euler pressure rise)"
        ],
        labs: [
          { code: "2B", bay: "02", sub: "vortex", title: "Free, Forced, Rankine & Spiral Vortices" }
        ]
      },
      {
        num: "4.6",
        title: "Principles of a Hydraulic Siphon",
        subtopics: ["Application of Bernoulli's theorem", "Summit sub-atmospheric pressure and cavitation limits"]
      },
      {
        num: "4.7",
        title: "Flow Rate Measurement in Pipes",
        subtopics: ["Venturimeter and discharge coefficient Cd", "Orifice meter and flow nozzle", "Pitot and Pitot-static probe"]
      },
      {
        num: "4.8",
        title: "Flows through Orifices and Mouthpieces",
        subtopics: ["Torricelli's theorem", "Vena contracta contraction Cc, velocity Cv, and discharge Cd coefficients", "Free and submerged discharge"]
      }
    ]
  },
  {
    chapter: 5,
    code: "CH05",
    title: "Integral Forms of Conservation Equations",
    status: "textbook",
    sections: [
      {
        num: "5.1",
        title: "Reynolds Transport Theorem (RTT)",
        subtopics: [
          "System to control volume mathematical transformation",
          "Integral mass conservation for moving and deformable control volumes",
          "Integral linear momentum equation and jet deflection thrust",
          "Angular momentum theorem and reaction torque balance",
          "First law of thermodynamics for control volumes (steady flow energy equation and head loss)"
        ]
      }
    ]
  },
  {
    chapter: 6,
    code: "CH06",
    title: "Principles of Physical Similarity and Dimensional Analysis",
    status: "textbook",
    sections: [
      {
        num: "6.1",
        title: "Introduction to Dimensional Analysis",
        subtopics: ["Fundamental dimensions (M, L, T, Theta)", "Principle of dimensional homogeneity"]
      },
      {
        num: "6.2",
        title: "Concept and Types of Physical Similarity",
        subtopics: ["Geometric similarity", "Kinematic similarity", "Dynamic similarity and scale ratios"]
      },
      {
        num: "6.3",
        title: "Application of Dynamic Similarity",
        subtopics: [
          "Buckingham Pi theorem and choice of repeating variables",
          "Reynolds number (Re: inertia to viscous ratio)",
          "Froude number (Fr: inertia to gravitational ratio)",
          "Euler number (Eu: pressure force to inertia ratio)",
          "Weber number (We: inertia to surface tension ratio)",
          "Mach number (Ma: inertia to compressibility ratio)",
          "Scale model testing and distorted river/hydraulic models"
        ]
      }
    ]
  },
  {
    chapter: 7,
    code: "CH07",
    title: "Flow of Ideal Fluids",
    status: "active",
    labs: ["2D"],
    sections: [
      {
        num: "7.1",
        title: "Introduction to Potential Flows",
        subtopics: ["Inviscid irrotational flows", "Superposition principle for linear Laplace equation"]
      },
      {
        num: "7.2",
        title: "Elementary 2D Potential Flows",
        subtopics: ["Uniform stream", "Line source and sink", "Doublet", "Free irrotational vortex"]
      },
      {
        num: "7.3",
        title: "Superposition of Elementary Flows",
        subtopics: [
          "Rankine half-body",
          "Rankine oval",
          "Non-lifting flow past a circular cylinder",
          "Lifting flow past a circular cylinder with circulation Gamma",
          "Off-wall detachment of stagnation points (|Gamma| > 4*pi*U_inf*a)"
        ],
        labs: [
          { code: "2D", bay: "02", sub: "potential", title: "Potential Superposition & Magnus Lift Cylinder" }
        ]
      },
      {
        num: "7.4",
        title: "Aerofoil Theory",
        subtopics: [
          "Kutta-Joukowski lift theorem (L' = -rho*U_inf*Gamma)",
          "D'Alembert's paradox: zero drag in steady potential flow",
          "Conformal mapping (Joukowski transformation)",
          "Kutta condition at trailing edge"
        ]
      }
    ]
  },
  {
    chapter: 8,
    code: "CH08",
    title: "Dynamics of Viscous Flows",
    status: "active",
    labs: ["3B", "3C", "3D", "4A"],
    sections: [
      {
        num: "8.1",
        title: "Introduction to Viscous Dynamics",
        subtopics: ["Viscous stress tensor formulation", "Stokes hypothesis and bulk viscosity"]
      },
      {
        num: "8.2",
        title: "Conservation of Linear Momentum in Differential Form",
        subtopics: ["Navier-Stokes equations in Cartesian and cylindrical coordinates", "Convective, pressure gradient, and viscous diffusion terms"]
      },
      {
        num: "8.3",
        title: "Exact Solutions of Navier-Stokes Equations",
        subtopics: [
          "Generalized Couette-Poiseuille flow under favorable and adverse pressure gradients",
          "Lower wall shear detachment and zero-net-flux backflow transition",
          "Hagen-Poiseuille flow in circular tubes and parabolic velocity profiles",
          "Immiscible two-layer channel flow with viscosity ratio and interface shear stress matching",
          "Non-Newtonian Herschel-Bulkley yield stress core and Navier wall slip boundary condition"
        ],
        labs: [
          { code: "3B", bay: "03", sub: "couette", title: "Generalized Couette-Poiseuille Channel Backflow" },
          { code: "3C", bay: "03", sub: "twolayer", title: "Immiscible Two-Layer Channel Flow" },
          { code: "3D", bay: "03", sub: "slip_hb", title: "Navier Wall Slip & Herschel-Bulkley Fluid" }
        ]
      },
      {
        num: "8.4",
        title: "Low Reynolds Number Flow and CFD Methods",
        subtopics: [
          "Creeping flow / Stokes flow past a sphere (Stokes drag law)",
          "Hele-Shaw potential flow analogy",
          "2D Lattice Boltzmann Method (LBM D2Q9) simulation of unsteady vortex wakes"
        ],
        labs: [
          { code: "4A", bay: "04", sub: "lbm", title: "2D LBM Wind Tunnel & Karman Vortex Wake" }
        ]
      }
    ]
  },
  {
    chapter: 9,
    code: "CH09",
    title: "Laminar Boundary Layers",
    status: "active",
    labs: ["3A"],
    sections: [
      {
        num: "9.1",
        title: "Introduction to Boundary Layers",
        subtopics: ["Prandtl's boundary layer hypothesis", "Order-of-magnitude scaling analysis"]
      },
      {
        num: "9.2",
        title: "Boundary Layer Equations",
        subtopics: ["Prandtl 2D boundary layer equations", "Wall and free-stream matching boundary conditions"]
      },
      {
        num: "9.3",
        title: "Blasius Flow Over a Flat Plate",
        subtopics: ["Similarity transformation eta = y*sqrt(U_inf / (nu*x))", "Blasius non-linear ODE", "Numerical solution and velocity profile"]
      },
      {
        num: "9.4",
        title: "Wall Shear and Boundary Layer Thicknesses",
        subtopics: ["99% thickness delta", "Displacement thickness delta*", "Momentum thickness theta", "Shape factor H = delta*/theta"]
      },
      {
        num: "9.5",
        title: "Momentum-Integral Equations for Boundary Layer",
        subtopics: ["von Karman momentum integral equation derivation"]
      },
      {
        num: "9.6",
        title: "Separation of Boundary Layer",
        subtopics: [
          "Adverse pressure gradient (dp/dx > 0)",
          "Wall profile curvature: d^2u/dy^2 = (1/mu)*(dp/dx)",
          "Interior inflection point",
          "Separation criterion tau_w = 0",
          "Falkner-Skan wedge flows and Hartree beta parameter"
        ],
        labs: [
          { code: "3A", bay: "03", sub: "separation", title: "Falkner-Skan & Boundary-Layer Separation" }
        ]
      },
      {
        num: "9.7",
        title: "Karman-Pohlhausen Approximate Method",
        subtopics: ["4th-degree polynomial profile", "Pohlhausen parameter lambda = (delta^2/nu)*(dU/dx)", "Separation limit at lambda = -12"]
      },
      {
        num: "9.8",
        title: "Integral Method for Non-Zero Pressure Gradient Flows",
        subtopics: ["Thwaites approximate method", "Prediction of laminar separation point"]
      },
      {
        num: "9.9",
        title: "Entry Flow in a Duct",
        subtopics: ["Hydrodynamic entrance length", "Boundary layer growth and core inviscid acceleration"]
      },
      {
        num: "9.10",
        title: "Control of Boundary Layer Separation",
        subtopics: ["Boundary layer suction and blowing", "Geometric streamlining", "Turbulence stimulators and vortex generators"]
      },
      {
        num: "9.11",
        title: "Mechanics of Boundary Layer Transition",
        subtopics: ["Tollmien-Schlichting waves", "Critical Reynolds numbers for flat plate and pipe"]
      },
      {
        num: "9.12",
        title: "Events of Transition",
        subtopics: ["Vorticity amplification", "Turbulent spots", "Fully developed turbulent boundary layer"]
      }
    ]
  },
  {
    chapter: 10,
    code: "CH10",
    title: "Turbulent Flow",
    status: "textbook",
    sections: [
      {
        num: "10.1",
        title: "Introduction and Characteristics of Turbulent Flow",
        subtopics: ["Irregularity and diffusivity", "3D vortex stretching", "Energy cascade and Kolmogorov scales"]
      },
      {
        num: "10.2",
        title: "Laminar-Turbulent Transition",
        subtopics: ["Critical Reynolds numbers", "Instability mechanisms"]
      },
      {
        num: "10.3",
        title: "Correlation Functions",
        subtopics: ["Autocorrelation and integral time scale", "Spatial cross-correlation and integral length scale"]
      },
      {
        num: "10.4",
        title: "Mean Motion and Fluctuations",
        subtopics: ["Reynolds decomposition (u = u_bar + u')", "Time-averaged velocity and turbulent kinetic energy (TKE)"]
      },
      {
        num: "10.5",
        title: "Derivation of Governing Equations for Turbulent Flow",
        subtopics: ["Reynolds-Averaged Navier-Stokes (RANS) equations", "Reynolds stress tensor (-rho*u'_i*u'_j)", "Turbulence closure problem"]
      },
      {
        num: "10.6",
        title: "Turbulent Boundary Layer Equations",
        subtopics: ["Boundary layer approximations for RANS equations"]
      },
      {
        num: "10.7",
        title: "Boundary Conditions",
        subtopics: ["Near-wall boundary condition", "Free-stream matching"]
      },
      {
        num: "10.8",
        title: "Shear Stress Models",
        subtopics: ["Boussinesq eddy viscosity hypothesis", "Prandtl mixing length hypothesis (l_m = kappa*y)"]
      },
      {
        num: "10.9",
        title: "Universal Velocity Distribution Law",
        subtopics: [
          "Viscous sublayer (u+ = y+ for y+ < 5)",
          "Buffer layer (5 < y+ < 30)",
          "Logarithmic law of the wall (u+ = (1/kappa)*ln(y+) + B for y+ > 30)",
          "Defect law and outer wake region"
        ]
      },
      {
        num: "10.10",
        title: "Fully Developed Turbulent Flow in a Pipe",
        subtopics: ["Friction factor equations (Prandtl, Colebrook-White, Blasius 1/4 power law)"]
      },
      {
        num: "10.11",
        title: "Skin Friction Coefficient for Boundary Layers on Flat Plates",
        subtopics: ["1/7th power law velocity profile", "Local skin friction coefficient C_f and total drag coefficient C_D"]
      }
    ]
  },
  {
    chapter: 11,
    code: "CH11",
    title: "Viscous Flows through Pipes",
    status: "active",
    labs: ["4C"],
    sections: [
      {
        num: "11.1",
        title: "Introduction to Pipe Flows",
        subtopics: ["Internal vs external viscous flows", "Laminar vs turbulent pipe flow regimes"]
      },
      {
        num: "11.2",
        title: "Concept of Friction Factor in a Pipe Flow",
        subtopics: ["Darcy-Weisbach equation (h_f = f*(L/D)*(V^2 / 2g))", "Fanning friction factor vs Darcy friction factor"]
      },
      {
        num: "11.3",
        title: "Variation of Friction Factor",
        subtopics: ["Hydraulically smooth pipes", "Fully rough regime", "Moody diagram interpretation and equivalent roughness k/D"]
      },
      {
        num: "11.4",
        title: "Energy Considerations in Pipe Flow",
        subtopics: ["Hydraulic Grade Line (HGL)", "Total Energy Line (TEL)", "Head loss dissipation along conduit"]
      },
      {
        num: "11.5",
        title: "Losses Due to Geometric Changes (Minor Losses)",
        subtopics: [
          "Borda-Carnot sudden pipe enlargement: loss h_L = (V1 - V2)^2 / (2g)",
          "Corner dead-zone eddy pressure matching: p' approx p1",
          "Sudden contraction and vena contracta loss",
          "Pipe entrance and exit losses"
        ],
        labs: [
          { code: "4C", bay: "04", sub: "expansion", title: "Borda-Carnot Sudden Pipe Expansion" }
        ]
      },
      {
        num: "11.6",
        title: "Concept of Flow Potential and Flow Resistance",
        subtopics: ["Fluid resistance analogy to electrical circuits", "Equivalent length method (L_eq / D)"]
      },
      {
        num: "11.7",
        title: "Flow through Branched and Parallel Pipes",
        subtopics: ["Series pipes", "Parallel pipes (equal head loss across branches)", "Loop distribution networks and Hardy Cross method"]
      },
      {
        num: "11.8",
        title: "Flow through Pipes with Side Tappings",
        subtopics: ["Manifold flow distribution", "Pressure variation along tappings"]
      },
      {
        num: "11.9",
        title: "Losses in Pipe Bends and Fittings",
        subtopics: ["Secondary flow in bends (Dean vortices)", "Valves, elbows, and tees loss coefficients"]
      },
      {
        num: "11.10",
        title: "Power Transmission by a Pipeline",
        subtopics: ["Maximum power condition (h_f = H/3)", "Transmission efficiency"]
      }
    ]
  },
  {
    chapter: 12,
    code: "CH12",
    title: "Flows with a Free Surface",
    status: "active",
    labs: ["4B"],
    sections: [
      {
        num: "12.1",
        title: "Introduction to Open Channel Flow",
        subtopics: ["Free surface boundary condition", "Hydraulic radius (R_h = A / P)"]
      },
      {
        num: "12.2",
        title: "Flow in Open Channels",
        subtopics: ["Chezy equation", "Manning equation for conveyance", "Most economical channel cross-sections"]
      },
      {
        num: "12.3",
        title: "Specific Energy and Alternate Depths",
        subtopics: ["Specific energy curve E = y + V^2 / (2g)", "Subcritical and supercritical flow regimes", "Critical depth y_c and minimum specific energy"]
      },
      {
        num: "12.4",
        title: "Hydraulic Jump",
        subtopics: [
          "Supercritical to subcritical abrupt transition",
          "Integral specific force conservation (F_s = const)",
          "Belanger equation for conjugate depths: h2/h1 = 0.5 * (sqrt(1 + 8*Fr1^2) - 1)",
          "Turbulent roller head loss dissipation (h_j = (h2 - h1)^3 / (4*h1*h2))"
        ],
        labs: [
          { code: "4B", bay: "04", sub: "jump", title: "Open-Channel Hydraulic Jump Dissipation" }
        ]
      },
      {
        num: "12.5",
        title: "Occurrence of Critical Conditions and Flow Measurement",
        subtopics: ["Broad-crested weirs", "Venturi flumes", "Specific energy choking"]
      }
    ]
  },
  {
    chapter: 13,
    code: "CH13",
    title: "Applications of Unsteady Flows",
    status: "textbook",
    sections: [
      {
        num: "13.1",
        title: "Introduction to Unsteady Flows",
        subtopics: ["Temporal derivatives", "Inertia forces in conduit acceleration"]
      },
      {
        num: "13.2",
        title: "Inertia Pressure and Accelerative Head",
        subtopics: ["Unsteady 1D momentum equation", "Accelerative head h_a = (L/g) * (dV/dt)"]
      },
      {
        num: "13.3",
        title: "Establishment of Flow in a Pipeline",
        subtopics: ["Valve opening transient", "Time to reach steady state against pipe friction"]
      },
      {
        num: "13.4",
        title: "Oscillation of Liquid in a U-Tube",
        subtopics: ["Natural frequency omega_0 = sqrt(2*g / L)", "Viscous damping effect"]
      },
      {
        num: "13.5",
        title: "Damped Oscillation between Two Reservoirs",
        subtopics: ["Connecting conduit dynamics", "Surge tank oscillation period"]
      },
      {
        num: "13.6",
        title: "Water Hammer Phenomenon",
        subtopics: [
          "Rapid vs slow valve closure",
          "Joukowsky pressure surge equation (delta_p = rho * c * delta_V)",
          "Acoustic wave speed in elastic pipe c = sqrt( (K/rho) / (1 + (K*D)/(E*e)) )",
          "Surge tank protection and air chambers"
        ]
      }
    ]
  },
  {
    chapter: 14,
    code: "CH14",
    title: "Compressible Flow",
    status: "textbook",
    sections: [
      {
        num: "14.1",
        title: "Introduction and Thermodynamics of Perfect Gases",
        subtopics: ["Equation of state p = rho*R*T", "Specific heats (c_p, c_v, gamma)", "Isentropic relations"]
      },
      {
        num: "14.2",
        title: "Speed of Sound and Mach Number",
        subtopics: ["Propagation of acoustic waves c = sqrt(gamma*R*T)", "Mach number regimes (subsonic, transonic, supersonic, hypersonic)"]
      },
      {
        num: "14.3",
        title: "Pressure Field Due to a Moving Source",
        subtopics: ["Doppler effect", "Mach cone and Mach angle sin(mu) = 1/Ma", "Zone of action and zone of silence"]
      },
      {
        num: "14.4",
        title: "Basic Equations for One-Dimensional Compressible Flow",
        subtopics: ["Continuity, momentum, and energy in differential form", "Area-velocity relation (dA/A = (Ma^2 - 1) * (dV/V))"]
      },
      {
        num: "14.5",
        title: "Stagnation and Sonic Properties",
        subtopics: ["Stagnation temperature, pressure, and density", "Critical / sonic state (Ma = 1)", "Choked flow in converging-diverging nozzles"]
      },
      {
        num: "14.6",
        title: "Normal Shock Waves",
        subtopics: ["Discontinuity jump conditions", "Rankine-Hugoniot equations", "Entropy increase across shock", "Total pressure loss"]
      },
      {
        num: "14.7",
        title: "Oblique Shock Waves and Expansion Fans",
        subtopics: ["Deflection angle theta and shock angle beta", "Prandtl-Meyer expansion fans"]
      }
    ]
  },
  {
    chapter: 15,
    code: "CH15",
    title: "Principles of Fluid Machines",
    status: "textbook",
    sections: [
      {
        num: "15.1",
        title: "Introduction and Classification of Fluid Machines",
        subtopics: ["Positive displacement vs rotodynamic machines", "Turbines vs pumps and compressors"]
      },
      {
        num: "15.2",
        title: "Euler's Turbomachine Equation",
        subtopics: ["Angular momentum principle", "Inlet and exit velocity triangles", "Theoretical head and blade power"]
      },
      {
        num: "15.3",
        title: "Rotodynamic Impulse Turbines (Pelton Wheel)",
        subtopics: ["Nozzle spear valve", "Bucket splitters and jet deflection", "Hydraulic efficiency and optimum blade speed ratio"]
      },
      {
        num: "15.4",
        title: "Rotodynamic Reaction Turbines",
        subtopics: ["Francis turbine", "Kaplan and propeller turbines", "Draft tube function and cavitation criteria (Thoma's sigma)"]
      },
      {
        num: "15.5",
        title: "Centrifugal Pumps",
        subtopics: ["Impeller vanes (backward-curved)", "Volute casing and diffusers", "Manometric head and pump characteristics", "Net Positive Suction Head (NPSH)"]
      },
      {
        num: "15.6",
        title: "Reciprocating Pumps and Hydraulic Systems",
        subtopics: ["Piston displacement and discharge", "Slip and percentage slip", "Air vessels and indicator diagrams"]
      }
    ]
  },
  {
    chapter: 16,
    code: "CH16",
    title: "Compressors, Fans and Blowers",
    status: "textbook",
    sections: [
      {
        num: "16.1",
        title: "Centrifugal Compressors",
        subtopics: ["Impeller dynamics", "Slip factor and Stodola formula", "Diffusers and scroll", "Surging and choking instabilities"]
      },
      {
        num: "16.2",
        title: "Axial Flow Compressors",
        subtopics: ["Stage velocity triangles", "Degree of reaction", "Rotor and stator blade loading", "Rotating stall"]
      },
      {
        num: "16.3",
        title: "Fans and Blowers",
        subtopics: ["Centrifugal and axial flow fans", "Static head and total head", "Fan performance laws and selection"]
      }
    ]
  }
];
