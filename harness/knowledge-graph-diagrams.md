# Knowledge Graph Diagrams

Below is a legend followed by certain diagrams describing how to fetch (dynamic) information about the resident and its home through the knowledge graph.

Cypher queries are not included yet.

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

## Getting Robins' Agenda

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

## Getting the temperature in the bedroom

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

## Getting information of a smart Kitchen Appliance

This is currently a feature that is not implemented yet. A stove is seen as a static thing, like a table, without any external data reference. Even the state is stored within the Knowledge graph. 

! Note, the storing of the state of an appliance within the knowledge graph should probably change, since we decided the knowledge graph should hold more "static" information.


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
