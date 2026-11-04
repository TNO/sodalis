# Companion graph examples

These diagrams illustrate how graph entities can reference changing information
about the resident and home. They are not an implemented connector contract.
See the [companion architecture](companion-harness.md) for executable tool
scope and the [evaluation](../evaluations/companion-harness.md) for observations
from the actual import.

Connection metadata below illustrates the source graph, not information the
harness exposes to the model. The host resolves references against configured
supported sources. Fixed query implementations live in
[homeGraph.ts](../../apps/server/src/assistant/harness/homeGraph.ts); arbitrary
model-generated Cypher is not supported.

## Legend
```mermaid
flowchart LR
    subgraph Legend["Legend"]
        direction TB
        LH["Human"]
        LS["System"]
        LE["Environment"]
        LW["Metadata or application step"]
        L1["Entity"] -->|Graph relationship| L2["Entity"]
        L3["Entity"] -.->|Property| L4["Value"]
    end

    classDef human fill:#E9D5FF,stroke:#7E22CE,color:#3B0764;
    classDef system fill:#FEF08A,stroke:#CA8A04,color:#422006;
    classDef environment fill:#BFDBFE,stroke:#2563EB,color:#172554;
    classDef workflow fill:#F3F4F6,stroke:#6B7280,color:#111827;

    class Robin,LH human;
    class Agenda,Service,LS system;
    class LE environment;
    class URL,Adapter,Auth,Resource,Lookup,Status,LW,L1,L2,L3,L4 workflow;
```

## Agenda reference (unsupported connector)

Microsoft Graph calendar retrieval is not implemented. An endpoint and
authentication reference in the graph do not authorize account access.

```mermaid
flowchart TD
    Robin["Robin<br/>Person"] -->|HAS_EXTERNAL_DATA| Agenda["Robin's agenda<br/>Data reference"]
    Agenda -->|ACCESSIBLE_THROUGH| Service["Calendar endpoint<br/>Data service"]

    Service -.->|endpointURL| URL["https://graph.microsoft.com/v1.0/me/calendarView"]
    Service -.->|adapter| Adapter["microsoft-graph-calendar"]
    Agenda -.->|authReference| Auth["ROBIN_GRAPH_TOKEN"]
    Agenda -.->|resourceIdentifier| Resource["primary-calendar"]

    classDef human fill:#E9D5FF,stroke:#7E22CE,color:#3B0764;
    classDef system fill:#FEF08A,stroke:#CA8A04,color:#422006;
    classDef environment fill:#BFDBFE,stroke:#2563EB,color:#172554;
    classDef workflow fill:#F3F4F6,stroke:#6B7280,color:#111827;

    class Robin,LH human;
    class Agenda,Service,LS system;
    class LE environment;
    class URL,Adapter,Auth,Resource,Lookup,Status,LW,L1,L2,L3,L4 workflow;

```

## Bedroom temperature reference (conflicting metadata, unsupported adapter)

The sensor is linked to the bathroom, despite the bedroom reference name.
The illustrated time-series HTTP adapter is unsupported. Do not infer a live
bedroom measurement from this diagram.

```mermaid
flowchart TD
    Sensor["Temperature sensor<br/>Device"] -->|INSTALLED_IN| Room["Bathroom<br/>Space"]
    Sensor -->|HAS_EXTERNAL_DATA| Reference["Bedroom temperature history<br/>Data reference"]
    Reference -->|ACCESSIBLE_THROUGH| Service["Temperature endpoint<br/>Data service"]

    Service -.->|endpointURL| URL["https://timeseries.example.org/query"]
    Service -.->|adapter| Adapter["timeseries"]
    Reference -.->|resourceIdentifier| Resource["apartment.bedroom.temperature"]
    Reference -.->|selector| Selector["field: temperature"]
    Reference -.->|unit| Unit["degree Celsius"]
    Reference -.->|authReference| Auth["TIMESERIES_CREDENTIAL"]

    classDef human fill:#E9D5FF,stroke:#7E22CE,color:#3B0764;
    classDef system fill:#FEF08A,stroke:#CA8A04,color:#422006;
    classDef environment fill:#BFDBFE,stroke:#2563EB,color:#172554;
    classDef workflow fill:#F3F4F6,stroke:#6B7280,color:#111827;

    class Sensor,Reference,Service system;
    class Room environment;
    class URL,Adapter,Resource,Selector,Unit,Auth,Lookup,Status workflow;

```

## Kitchen appliance (configured state only)

A stove without an external-data reference has no supported live-state read.
Its graph state is a configured value, like other static properties, not an
observation. Keeping changing state outside the graph is the design direction;
the existing property must not be silently reinterpreted as current data.
```mermaid
flowchart TD
    Stove["Stove<br/>Appliance"] -->|LOCATED_IN| Kitchen["Kitchen<br/>Space"]

    Stove -.->|state| State["off"]
    State --> Warning["Configured state<br/>Not a live reading"]

    Stove --> Lookup["Application looks for external-data reference"]
    Lookup --> Missing["No HAS_EXTERNAL_DATA link"]
    Missing --> Status["Dynamic on/off retrieval unavailable"]

    classDef human fill:#E9D5FF,stroke:#7E22CE,color:#3B0764;
    classDef system fill:#FEF08A,stroke:#CA8A04,color:#422006;
    classDef environment fill:#BFDBFE,stroke:#2563EB,color:#172554;
    classDef workflow fill:#F3F4F6,stroke:#6B7280,color:#111827;

    class Stove,Kitchen environment;
    class State,Warning,Lookup,Missing,Status workflow;
```
