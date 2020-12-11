/* eslint-disable max-params, camelcase */

//
// NodeJS class to query and control Panasonic(tm) Viera(tm) Smart-TVs
//
// This nodejs class provides functionality to query and control a
// Panasonic Viera SmartTV through its public API. The functionality of this
// class is largely based on previous work and knowledge of the following
// open source projects:
//
//   https://github.com/samuelmatis/viera.js
//   https://github.com/g30r93g/viera.js
//   https://github.com/AntonioMeireles/homebridge-vieramatic
//
// Copyright (c) 2020-2021 Jens Maus <mail@jens-maus.de>
//
// The MIT License (MIT)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import http from 'http';
import crypto from 'crypto';

const URN_RENDERING_CONTROL = 'schemas-upnp-org:service:RenderingControl:1';
const URN_REMOTE_CONTROL = 'panasonic-com:service:p00NetworkControl:1';
const URL_CONTROL_DMR = '/dmr/control_0';
const URL_CONTROL_NRC = '/nrc/control_0';
// Const URL_CONTROL_NRC_DDD = '/nrc/ddd.xml';
// const URL_CONTROL_NRC_DEF = '/nrc/sdd_0.xml';
const TV_TYPE_NONENCRYPTED = 0;
const TV_TYPE_ENCRYPTED = 1;
const DEFAULT_PORT = 55000;

/// ///////////////////////////////////////////////////////////
// PUBLIC CLASS
class Viera {
  constructor() {
    // Initialize our private class
    this.private = new VieraPrivate();
  }

  connect(ipAddress, app_id, encryption_key) {
    return new Promise((resolve, reject) => {
      // Check if ipAddress is valid IP address
      const ipRegExp = /^((\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.){3}(\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])$/;

      if (ipRegExp.test(ipAddress)) {
        this.private._ipAddress = ipAddress;

        if (typeof (app_id) === 'undefined' || typeof (encryption_key) === 'undefined') {
          this.private._type = TV_TYPE_NONENCRYPTED;
        } else {
          this.private._type = TV_TYPE_ENCRYPTED;
          this.private._app_id = app_id;
          this.private._enc_key = encryption_key;
        }

        resolve(true);
      } else {
        reject(new Error('You entered invalid IP address!'));
      }
    }).then(() => {
      // Derive session keys
      return this.private._derive_session_keys();
    }).then(() => {
      // Get session id
      return this.private._request_session_id();
    }).catch(error => {
      return error;
    });
  }

  /**
     * Send a request for a displayed pin code
     *
     * @param {String} name the name display when requesting the pin code
     */
  requestPinCode(name) {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_NRC, URN_REMOTE_CONTROL, 'X_DisplayPinCode', '<X_DeviceName>' + name + '</X_DeviceName>')
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Send a command to the TV
     *
     * @param {String} command Command from codes.txt
     */
  sendKey(command) {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_NRC, URN_REMOTE_CONTROL, 'X_SendKey', '<X_KeyEvent>' + command.toUpperCase() + '</X_KeyEvent>')
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Send a change HDMI input to the TV
     *
     * @param {String} hdmiInput Command from codes.txt
     */
  sendHDMICommand(hdmiInput) {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_NRC, URN_REMOTE_CONTROL, 'X_SendKey', '<X_KeyEvent>NRC_HDMI' + (hdmiInput - 1) + '-ONOFF</X_KeyEvent>')
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Send command to open app on the TV
     *
     * @param {String} appID appId from codes.txt
     */
  sendAppCommand(appID) {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_NRC, URN_REMOTE_CONTROL, 'X_LaunchApp', '<X_AppType>vc_app<X_AppType><X_LaunchKeyword>product_id=' + appID + '</X_LaunchKeyword>')
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Get volume from TV
     *
     */
  getVolume() {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_DMR, URN_RENDERING_CONTROL, 'GetVolume', '<InstanceID>0</InstanceID><Channel>Master</Channel>')
        .then(result => {
          const match = /<CurrentVolume>(\d*)<\/CurrentVolume>/gm.exec(result || '');
          if (match) {
            const volume = match[1];
            resolve(Number.parseFloat(volume));
          } else {
            reject(new Error('No data found'));
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Set volume
     *
     * @param {number} volume Desired volume in range from 0 to 100
     * @param {function} callback called when the command is called
     */
  setVolume(volume) {
    return new Promise((resolve, reject) => {
      if (volume < 0 || volume > 100) {
        reject(new Error('Volume must be in range from 0 to 100'));
      } else {
        this.private._soap_request(URL_CONTROL_DMR, URN_RENDERING_CONTROL, 'SetVolume', '<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>' + volume + '</DesiredVolume>')
          .then(result => {
            resolve(result);
          })
          .catch(error => {
            reject(error);
          });
      }
    });
  }

  /**
     * Get the current mute setting
     *
     * @param {Function} callback
     */
  getMute() {
    return new Promise((resolve, reject) => {
      this.private._soap_request(URL_CONTROL_DMR, URN_RENDERING_CONTROL, 'GetMute', '<InstanceID>0</InstanceID><Channel>Master</Channel>').then(data => {
        const regex = /<CurrentMute>([01])<\/CurrentMute>/gm;
        const match = regex.exec(data || '');
        if (match) {
          const mute = (match[1] === '1');
          resolve(mute);
        } else {
          reject(new Error('No data found'));
        }
      });
    });
  }

  /**
     * Set mute to on/off
     *
     * @param {Boolean} enable The value to set mute to
     * @param {function} callback called when the command is called
     */
  setMute(enable) {
    return new Promise((resolve, reject) => {
      const mute = (enable) ? '1' : '0';
      this.private._soap_request(URL_CONTROL_DMR, URN_RENDERING_CONTROL, 'SetMute', '<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>' + mute + '</DesiredMute>')
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }
}

/// ///////////////////////////////////////////////////////////
// PRIVATE CLASS
class VieraPrivate {
  /**
     * Create and send a SOAP request to the TV
     *
     * @param {String} type    Type of your request
     * @param {String} action  The xml action type to perform
     * @param {String} command The command from codes.txt you want to perform
     */
  _soap_request(url, urn, action, parameters, body_element) {
    return new Promise((resolve, reject) => {
      console.log(action);

      if (typeof (body_element) === 'undefined') {
        body_element = 'u';
      }

      let is_encrypted = false;

      // Encapsulate URN_REMOTE_CONTROL command in an X_EncryptedCommand if we're using encryption
      if (this._type === TV_TYPE_ENCRYPTED && urn === URN_REMOTE_CONTROL &&
          (action !== 'X_GetEncryptSessionId' && action !== 'X_DisplayPinCode' && action !== 'X_RequestAuth')) {
        if (typeof (this._session_key) !== 'undefined' &&
            typeof (this._session_iv) !== 'undefined' &&
            typeof (this._session_hmac_key) !== 'undefined' &&
            typeof (this._session_id) !== 'undefined' &&
            typeof (this._session_seq_num) !== 'undefined') {
          // Flag as encrypted
          is_encrypted = true;

          // Increment the sequence number
          this._session_seq_num += 1;

          const command =
                `<X_SessionId>${this._session_id}</X_SessionId>` +
                `<X_SequenceNumber>${`00000000${this._session_seq_num}`.slice(-8)}</X_SequenceNumber>` +
                `<X_OriginalCommand><${body_element}:${action} xmlns:${body_element}="urn:${urn}">${parameters}</${body_element}:${action}></X_OriginalCommand>`;

          const encrypted_command = this._encrypt_soap_payload(command, this._session_key, this._session_iv, this._session_hmac_key);

          action = 'X_EncryptedCommand';
          parameters =
                `<X_ApplicationId>${this._app_id}</X_ApplicationId>` +
                `<X_EncInfo>${encrypted_command}</X_EncInfo>`;
        }
      }

      const body = '<?xml version="1.0" encoding="utf-8"?>' +
                     '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
                     '<s:Body>' +
                       `<${body_element}:${action} xmlns:${body_element}="urn:${urn}">${parameters}</${body_element}:${action}>` +
                     '</s:Body>' +
                     '</s:Envelope>';

      const postRequest = {
        host: this._ipAddress,
        path: url,
        port: DEFAULT_PORT,
        method: 'POST',
        headers: {
          'Content-Length': body.length,
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPAction: `"urn:${urn}#${action}"`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Accept: 'text/xml'
        }
      };

      const request = http.request(postRequest, response => {
        let result = '';
        response.setEncoding('utf8');
        response.on('data', data => {
          result += (data || '').toString();
        });
        response.on('end', () => {
          // Check if the result contains any X_EndResult and if so
          // we decrypt it accordingly
          const regex = /<X_EncResult>(.*)<\/X_EncResult>/gm;
          const match = regex.exec(result);
          if (match) {
            const decrypted = this._decrypt_soap_payload(
              match[1],
              this._session_key,
              this._session_iv,
              this._session_hmac_key);

            result = result.replace(/<x_encresult>.*<\/x_encresult>/gim, decrypted);
          }

          resolve(result);
        });
      });

      request.on('error', error => {
        if (is_encrypted === true) {
          this._session_seq_num -= 1;
        }

        reject(error);
      });

      request.write(body);
      request.end();
    });
  }

  /**
     * Derive the session key
     */
  _derive_session_keys() {
    return new Promise(resolve => {
      const iv = Buffer.from(this._enc_key, 'base64');
      this._session_iv = iv;

      // Derive key from IV
      this._session_key = Buffer.alloc(16);
      let i = 0;
      while (i < 16) {
        this._session_key[i] = iv[i + 2];
        this._session_key[i + 1] = iv[i + 3];
        this._session_key[i + 2] = iv[i];
        this._session_key[i + 3] = iv[i + 1];
        i += 4;
      }

      // HMAC key for comms is just the IV repeated twice
      this._session_hmac_key = Buffer.concat([iv, iv]);

      // Console.log(this._session_iv);
      // console.log(this._session_key);
      // console.log(this._session_hmac_key);

      resolve();
    });
  }

  /**
     * Request session id
     *
     * Let's ask for a session. We'll need to use a valid
     * session ID for encrypted NRC commands.
     */
  _request_session_id() {
    return new Promise((resolve, reject) => {
      // We need to send an encrypted version of X_ApplicationId
      const encinfo = this._encrypt_soap_payload(
        '<X_ApplicationId>' + this._app_id + '</X_ApplicationId>',
        this._session_key,
        this._session_iv,
        this._session_hmac_key);

      // Send the encrypted SOAP request along with plaintext X_ApplicationId
      const parameters = '<X_ApplicationId>' + this._app_id + '</X_ApplicationId>' +
                     '<X_EncInfo>' + encinfo + '</X_EncInfo>';

      // Send the request to received the encrypted session id
      this._soap_request(URL_CONTROL_NRC, URN_REMOTE_CONTROL, 'X_GetEncryptSessionId', parameters)
        .then(result => {
          const regex = /<X_SessionId>(.*)<\/X_SessionId>/gm;
          const match = regex.exec(result);
          if (match) {
            // Set session ID and begin sequence number at 1.
            // We have to increment the sequence number upon each successful NRC command
            this._session_id = match[1];
            this._session_seq_num = 1;

            resolve();
          } else {
            reject(new Error('no X_SessionID found'));
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
     * Encrypt payload using AES and the key/iv/hmac_key combo
     *
     * The encrypted payload must begin with a 16-byte header
     * (12 random bytes, and 4 bytes for the payload length in big endian)
     * Note: the server does not appear to ever send back valid payload
     * lengths in bytes 13-16, so I would assume these can also
     * be randomized by the client, but we'll set them anyway to be safe.
     */
  _encrypt_soap_payload(data, key, iv, hmac_key) {
    // Start with 12 random bytes
    let payload = Buffer.from(crypto.randomBytes(12));

    // Add 4 bytes (big endian) of the length of data
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(data.length, 0);
    payload = Buffer.concat([payload, buf, Buffer.from(data)]);

    /*
      Console.log("PAYLOAD:");
      console.log(payload);
      console.log(payload.length);
      console.log('"' + payload.toString() + '"');
      console.log("PAYLOAD DONE:");
      */

    // initialize AES-128-CBC with key and IV
    const aes = crypto.createCipheriv('aes-128-cbc', key, iv);

    // Encrypt the payload
    let ciphertext = aes.update(payload);
    ciphertext = Buffer.concat([ciphertext, aes.final()]);
    /*
      Console.log(ciphertext.length);
      console.log(ciphertext.toString('hex'));
      */

    // compute HMAC-SHA-256
    const sig = crypto.createHmac('sha256', hmac_key).update(ciphertext).digest();
    /*
      Console.log(sig.length);
      console.log(sig.toString('hex'));
      */

    // concat HMAC with AES encrypted payload
    const result = Buffer.concat([ciphertext, sig]);

    // Console.log(payload);
    // console.log(ciphertext);
    // console.log(sig);
    // console.log(result.toString('base64'));

    return result.toString('base64');
  }

  /**
     * Encrypt payload using AES and the key/iv/hmac_key combo
     */
  _decrypt_soap_payload(data, key, iv, _hmac_key) {
    // Initialize AES-128-CBC with key and IV
    const aes = crypto.createDecipheriv('aes-128-cbc', key, iv);

    // Decrypt
    const decrypted = aes.update(Buffer.from(data, 'base64'));
    // Decrypted = Buffer.concat([decrypted, aes.final()]);

    // the valid decrypted data starts at byte offset 16
    const decryptedString = decrypted.toString('utf-8', 16, decrypted.indexOf('\u0000', 16));

    // Console.log(decrypted.toString('hex'));
    // console.log(Buffer.from(decryptedStr));

    return decryptedString;
  }
}

const VieraKeys = {
  thirty_second_skip: 'NRC_30S_SKIP-ONOFF',
  toggle_3d: 'NRC_3D-ONOFF',
  apps: 'NRC_APPS-ONOFF',
  aspect: 'NRC_ASPECT-ONOFF',
  back: 'NRC_RETURN-ONOFF',
  blue: 'NRC_BLUE-ONOFF',
  cancel: 'NRC_CANCEL-ONOFF',
  cc: 'NRC_CC-ONOFF',
  chat_mode: 'NRC_CHAT_MODE-ONOFF',
  ch_down: 'NRC_CH_DOWN-ONOFF',
  input_key: 'NRC_CHG_INPUT-ONOFF',
  network: 'NRC_CHG_NETWORK-ONOFF',
  ch_up: 'NRC_CH_UP-ONOFF',
  num_0: 'NRC_D0-ONOFF',
  num_1: 'NRC_D1-ONOFF',
  num_2: 'NRC_D2-ONOFF',
  num_3: 'NRC_D3-ONOFF',
  num_4: 'NRC_D4-ONOFF',
  num_5: 'NRC_D5-ONOFF',
  num_6: 'NRC_D6-ONOFF',
  num_7: 'NRC_D7-ONOFF',
  num_8: 'NRC_D8-ONOFF',
  num_9: 'NRC_D9-ONOFF',
  diga_control: 'NRC_DIGA_CTL-ONOFF',
  display: 'NRC_DISP_MODE-ONOFF',
  down: 'NRC_DOWN-ONOFF',
  enter: 'NRC_ENTER-ONOFF',
  epg: 'NRC_EPG-ONOFF',
  exit: 'NRC_CANCEL-ONOFF',
  ez_sync: 'NRC_EZ_SYNC-ONOFF',
  favorite: 'NRC_FAVORITE-ONOFF',
  fast_forward: 'NRC_FF-ONOFF',
  game: 'NRC_GAME-ONOFF',
  green: 'NRC_GREEN-ONOFF',
  guide: 'NRC_GUIDE-ONOFF',
  hold: 'NRC_HOLD-ONOFF',
  home: 'NRC_HOME-ONOFF',
  index: 'NRC_INDEX-ONOFF',
  info: 'NRC_INFO-ONOFF',
  connect: 'NRC_INTERNET-ONOFF',
  left: 'NRC_LEFT-ONOFF',
  menu: 'NRC_MENU-ONOFF',
  mpx: 'NRC_MPX-ONOFF',
  mute: 'NRC_MUTE-ONOFF',
  net_bs: 'NRC_NET_BS-ONOFF',
  net_cs: 'NRC_NET_CS-ONOFF',
  net_td: 'NRC_NET_TD-ONOFF',
  off_timer: 'NRC_OFFTIMER-ONOFF',
  pause: 'NRC_PAUSE-ONOFF',
  pictai: 'NRC_PICTAI-ONOFF',
  play: 'NRC_PLAY-ONOFF',
  p_nr: 'NRC_P_NR-ONOFF',
  power: 'NRC_POWER-ONOFF',
  program: 'NRC_PROG-ONOFF',
  record: 'NRC_REC-ONOFF',
  red: 'NRC_RED-ONOFF',
  return_key: 'NRC_RETURN-ONOFF',
  rewind: 'NRC_REW-ONOFF',
  right: 'NRC_RIGHT-ONOFF',
  r_screen: 'NRC_R_SCREEN-ONOFF',
  last_view: 'NRC_R_TUNE-ONOFF',
  sap: 'NRC_SAP-ONOFF',
  toggle_sd_card: 'NRC_SD_CARD-ONOFF',
  skip_next: 'NRC_SKIP_NEXT-ONOFF',
  skip_prev: 'NRC_SKIP_PREV-ONOFF',
  split: 'NRC_SPLIT-ONOFF',
  stop: 'NRC_STOP-ONOFF',
  subtitles: 'NRC_STTL-ONOFF',
  option: 'NRC_SUBMENU-ONOFF',
  surround: 'NRC_SURROUND-ONOFF',
  swap: 'NRC_SWAP-ONOFF',
  text: 'NRC_TEXT-ONOFF',
  tv: 'NRC_TV-ONOFF',
  up: 'NRC_UP-ONOFF',
  link: 'NRC_VIERA_LINK-ONOFF',
  volume_down: 'NRC_VOLDOWN-ONOFF',
  volume_up: 'NRC_VOLUP-ONOFF',
  vtools: 'NRC_VTOOLS-ONOFF',
  yellow: 'NRC_YELLOW-ONOFF'
};

export {VieraKeys, Viera};
