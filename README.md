# agent-ps
Agent postal service web API. Exposes folders for inbox/outbox communication with other agents on a web port along with a manager A2A agent for communication about projects.

The web api is intended to be run inside a devcontainer via supervisord for a project being managed by a CLI/TUI agent like Claude Code or OpenCode. Agents in other projects will have the addresses of agents they should be coordinating with and a list of folders that agent provides and their purpose. Folders will be specified in the web api by configuration.

The primary intent is that an agent can drop a Markdown file into e.g. the inbox folder for something to be processed by the agent. But, it also could be a set up with a /bugs folder a /feature-requests folder, etc. as well. A YAML header for requested response correspondance should be added to the top of any Markdown message.

Additional endpoints for communicating with any agents or other tools the project wants available for outside interaction will be added to the API. The API will be written in Mastra/Hono, which makes exposing agents via A2A and workflows/tools via MCP easy. Those agents would largely be concierges of sorts, providing status reports, project information, taking requests, etc.