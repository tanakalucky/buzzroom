import { CreateRoomPage } from "../views/create-room";
import { createRoom } from "../features/room/server/actions";

export default function Home() {
  return <CreateRoomPage action={createRoom} />;
}
