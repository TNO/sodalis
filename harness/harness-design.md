# Harness for Sodalis

Currently desiging an harness for Sodalis that needs to have the following capabilities:

- Light weight
- Fast with responses
- Able to extend easily with custom tools
- Able to customize 
- Sandboxing ability
- Existing suite of reuseable tools
- Open source with a community
- Ability to switch models with ease

Since we are developing a human companion / assistant we are not looking at coding agents. We specifically want to avoid all unnecessary overhead that comes with these coding agents, e.g. strict code verification & tests.


## Tools

### Knowledge Graph

Information about the home and person is encoded inside of a knowledge graph. This graph contains information about the classes `Human`, `System`, `Environment` and a test class named `Scenario`.

Dynamic information is not stored inside the knowledge graph, links on how to acces that information are stored instead. [In the knowledge graph diagrams](./knowledge-graph-diagrams.md) we try to show how this data is represented inside the graph.

### Email

We want to interface with existing email applications. Sodalis is "running" in a webbrowser that has a desktop environment. We need to looking into the option of opening an email screen over there.

The functionalities we expect are:

- Summarizing the contents of received emails. We should be able to pass an parameter that describes the target of the summarization. (latest email, latest unread email, lastest 5 emails, latest 5 unread emails)
- Drafting a new email. Should be able to create a new draft or edit existing onces.
- Sending an email. Should only be able to do so with explicit user consent. 
  
### Web Search

We want a simple web search capability to retrieve new knowledge. Sodalis is "running" in a webbrowser that has a desktop environment. We need to looking into the option of opening a browser with the contents over there.

The functionalities we expect are:

- Performing simple searches through a pre-defined search engine. For example, the user might request the latest news. This should be gathered, summarized and given back to the user.
- Opening a webbrowser containing the search request. For example, the resident may inquire about where to find more information about a specific topic. This search could be executed by a search engine in a browser.

### Thuisarts (preliminary, not ready)

Just an idea, how about drawing information from [thuisarts](https://www.thuisarts.nl/) if the user requests anything medical related?