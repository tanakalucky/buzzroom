import { CreateRoomPage } from "../src/views/create-room";
import { createRoom } from "../src/features/room/server/actions";

export default function Home() {
  return <CreateRoomPage action={createRoom} />;
}
