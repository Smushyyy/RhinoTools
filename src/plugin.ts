import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { RhinoToolAction } from "./actions/rhino-tool";

streamDeck.logger.setLevel(LogLevel.TRACE);
streamDeck.actions.registerAction(new RhinoToolAction());
await streamDeck.connect();
