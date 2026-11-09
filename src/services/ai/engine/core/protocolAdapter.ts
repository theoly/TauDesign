/** Compatibility export: one provider codec is shared by core and direct AIService callers. */
export {encodeModelRequest as prepareModelRequest} from '../../modelRequestCodec';
export type {PreparedRequest} from '../../modelRequestCodec';
