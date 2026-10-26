/// Incremental, lossy UTF-8 decoding for the native HTTP → IPC text stream.
/// Only an unfinished code point (at most three bytes) survives between pushes.
/// Invalid bytes and incomplete EOF match `String::from_utf8_lossy` on the whole body.
#[derive(Default)]
pub(crate) struct Utf8StreamDecoder {
    pending: Vec<u8>,
}

impl Utf8StreamDecoder {
    pub(crate) fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut output = String::new();
        let mut consumed = 0;
        while consumed < self.pending.len() {
            match std::str::from_utf8(&self.pending[consumed..]) {
                Ok(valid) => {
                    output.push_str(valid);
                    consumed = self.pending.len();
                }
                Err(error) => {
                    let valid_end = consumed + error.valid_up_to();
                    // `valid_up_to` guarantees this prefix is UTF-8; no unchecked conversion.
                    output
                        .push_str(std::str::from_utf8(&self.pending[consumed..valid_end]).unwrap());
                    consumed = valid_end;
                    match error.error_len() {
                        Some(invalid_len) => {
                            output.push('\u{fffd}');
                            consumed += invalid_len;
                        }
                        None => break, // Incomplete code point: wait for the next HTTP chunk.
                    }
                }
            }
        }
        self.pending.drain(..consumed);
        output
    }

    /// Flush only on a successful network EOF. On a read error the caller emits
    /// the existing Error event, without manufacturing a successful Done event.
    pub(crate) fn finish(&mut self) -> String {
        let output = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        output
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8StreamDecoder;

    fn decode(parts: &[&[u8]]) -> String {
        let mut decoder = Utf8StreamDecoder::default();
        let mut output = String::new();
        for part in parts {
            output.push_str(&decoder.push(part));
            assert!(decoder.pending.len() <= 3);
        }
        output.push_str(&decoder.finish());
        assert!(decoder.finish().is_empty());
        output
    }

    #[test]
    fn every_two_and_three_chunk_boundary_preserves_unicode() {
        for text in [
            "",
            "ASCII\r\n\0",
            "主按钮：提交并核销",
            "é€🙂🚀",
            "e\u{301}👩‍💻",
            "data: {\"text\":\"中文🙂\"}\n\n",
        ] {
            let bytes = text.as_bytes();
            for first in 0..=bytes.len() {
                assert_eq!(decode(&[&bytes[..first], &bytes[first..]]), text);
                for second in first..=bytes.len() {
                    assert_eq!(
                        decode(&[&bytes[..first], &bytes[first..second], &bytes[second..]]),
                        text
                    );
                }
            }
            for size in 1..=bytes.len().max(1) {
                assert_eq!(decode(&bytes.chunks(size).collect::<Vec<_>>()), text);
            }
        }
    }

    #[test]
    fn incomplete_character_is_not_emitted_early() {
        let mut decoder = Utf8StreamDecoder::default();
        let bytes = "🙂".as_bytes();
        assert_eq!(decoder.push(&bytes[..1]), "");
        assert_eq!(decoder.push(&[]), "");
        assert_eq!(decoder.push(&bytes[1..3]), "");
        assert_eq!(decoder.push(&bytes[3..]), "🙂");
        assert_eq!(decoder.finish(), "");
    }

    #[test]
    fn malformed_bytes_and_incomplete_eof_match_whole_body_lossy_decoding() {
        for bytes in [
            &[0xff, b'A', 0x80][..],
            &[0xe4, 0xb8],
            &[0xf0, 0x9f, 0x99],
            &[0xe4, b'B', 0xb8],
            &[0xf0, 0x9f, 0xff, b'C'],
            &[0xc0, 0xaf, 0xed, 0xa0, 0x80, 0xf4, 0x90, 0x80, 0x80],
        ] {
            let expected = String::from_utf8_lossy(bytes);
            for first in 0..=bytes.len() {
                for second in first..=bytes.len() {
                    assert_eq!(
                        decode(&[&bytes[..first], &bytes[first..second], &bytes[second..]]),
                        expected
                    );
                }
            }
        }
    }

    #[test]
    fn incomplete_tail_is_flushed_once_and_decoder_can_be_reused() {
        let mut decoder = Utf8StreamDecoder::default();
        assert_eq!(decoder.push(&[b'a', 0xe4, 0xb8]), "a");
        assert_eq!(decoder.finish(), "�");
        assert_eq!(decoder.finish(), "");
        assert_eq!(decoder.push("主按钮".as_bytes()), "主按钮");
        assert_eq!(decoder.finish(), "");
    }
}
