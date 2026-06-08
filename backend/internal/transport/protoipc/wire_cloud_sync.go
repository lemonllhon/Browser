package protoipc

import "google.golang.org/protobuf/encoding/protowire"

const (
	MethodCloudSyncStatusGet                   = "trace.cloudSync.StatusGet"
	MethodCloudSyncLoginBind                   = "trace.cloudSync.LoginBind"
	MethodCloudSyncOAuthStart                  = "trace.cloudSync.OAuthStart"
	MethodCloudSyncRefreshStatus               = "trace.cloudSync.RefreshStatus"
	MethodCloudSyncLogout                      = "trace.cloudSync.Logout"
	MethodCloudSyncEncryptionSetup             = "trace.cloudSync.EncryptionSetup"
	MethodCloudSyncEncryptionUnlock            = "trace.cloudSync.EncryptionUnlock"
	MethodCloudSyncEncryptionDisable           = "trace.cloudSync.EncryptionDisable"
	MethodCloudSyncBackupList                  = "trace.cloudSync.BackupList"
	MethodCloudSyncBackupUpload                = "trace.cloudSync.BackupUpload"
	MethodCloudSyncBackupDownload              = "trace.cloudSync.BackupDownload"
	MethodCloudSyncBackupRestore               = "trace.cloudSync.BackupRestore"
	MethodCloudSyncBackupDelete                = "trace.cloudSync.BackupDelete"
	MethodCloudSyncProfileBackupUpload         = "trace.cloudSync.ProfileBackupUpload"
	MethodCloudSyncProfileBackupPrepareRestore = "trace.cloudSync.ProfileBackupPrepareRestore"
)

type CloudSyncJSONMessage struct {
	JSON string
}

func EncodeCloudSyncJSONMessage(message CloudSyncJSONMessage) []byte {
	var out []byte
	out = appendStringField(out, 1, message.JSON)
	return out
}

func DecodeCloudSyncJSONMessage(payload []byte) (CloudSyncJSONMessage, error) {
	var result CloudSyncJSONMessage
	err := consumeFields(payload, func(field protowire.Number, wireType protowire.Type, value []byte) error {
		if field != 1 {
			return nil
		}
		text, err := consumeStringValue(wireType, value)
		result.JSON = text
		return err
	})
	if err != nil {
		return CloudSyncJSONMessage{}, err
	}
	return result, nil
}
