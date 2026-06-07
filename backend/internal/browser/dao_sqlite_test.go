package browser

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"path/filepath"
	"strings"
	"testing"
)

func newSQLiteBrowserTestDB(t *testing.T) *database.DB {
	t.Helper()

	db, err := database.NewDB(filepath.Join(t.TempDir(), "trace-browser-test.db"))
	if err != nil {
		t.Fatalf("创建测试数据库失败: %v", err)
	}
	if err := db.Migrate(); err != nil {
		_ = db.Close()
		t.Fatalf("迁移测试数据库失败: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	return db
}

func TestSQLiteCoreDAOSetDefaultMissingKeepsExistingDefault(t *testing.T) {
	db := newSQLiteBrowserTestDB(t)
	dao := NewSQLiteCoreDAO(db.GetConn())

	if err := dao.Upsert(Core{CoreId: "core-a", CoreName: "Core A", CorePath: "chrome/a", IsDefault: true}); err != nil {
		t.Fatalf("保存默认内核失败: %v", err)
	}
	if err := dao.Upsert(Core{CoreId: "core-b", CoreName: "Core B", CorePath: "chrome/b"}); err != nil {
		t.Fatalf("保存备用内核失败: %v", err)
	}

	err := dao.SetDefault("missing-core")
	if err == nil || !strings.Contains(err.Error(), "内核不存在") {
		t.Fatalf("期望缺失内核返回错误，实际=%v", err)
	}

	cores, err := dao.List()
	if err != nil {
		t.Fatalf("查询内核失败: %v", err)
	}
	defaults := defaultCoreIDs(cores)
	if len(defaults) != 1 || defaults[0] != "core-a" {
		t.Fatalf("缺失内核设置默认不应清空原默认，defaults=%v cores=%#v", defaults, cores)
	}
}

func TestSQLiteCoreDAOUpsertDefaultLeavesSingleDefault(t *testing.T) {
	db := newSQLiteBrowserTestDB(t)
	dao := NewSQLiteCoreDAO(db.GetConn())

	if err := dao.Upsert(Core{CoreId: "core-a", CoreName: "Core A", CorePath: "chrome/a", IsDefault: true}); err != nil {
		t.Fatalf("保存 core-a 失败: %v", err)
	}
	if err := dao.Upsert(Core{CoreId: "core-b", CoreName: "Core B", CorePath: "chrome/b", IsDefault: true}); err != nil {
		t.Fatalf("保存 core-b 失败: %v", err)
	}

	cores, err := dao.List()
	if err != nil {
		t.Fatalf("查询内核失败: %v", err)
	}
	defaults := defaultCoreIDs(cores)
	if len(defaults) != 1 || defaults[0] != "core-b" {
		t.Fatalf("期望仅 core-b 为默认，defaults=%v cores=%#v", defaults, cores)
	}
}

func TestManagerDeleteDefaultCorePromotesRemainingDAOCore(t *testing.T) {
	db := newSQLiteBrowserTestDB(t)
	mgr := NewManager(config.DefaultConfig(), t.TempDir())
	mgr.CoreDAO = NewSQLiteCoreDAO(db.GetConn())

	if err := mgr.SaveCore(CoreInput{CoreId: "core-a", CoreName: "Core A", CorePath: "chrome/a", IsDefault: true}); err != nil {
		t.Fatalf("保存默认内核失败: %v", err)
	}
	if err := mgr.SaveCore(CoreInput{CoreId: "core-b", CoreName: "Core B", CorePath: "chrome/b"}); err != nil {
		t.Fatalf("保存备用内核失败: %v", err)
	}

	if err := mgr.DeleteCore("core-a"); err != nil {
		t.Fatalf("删除默认内核失败: %v", err)
	}
	defaults := defaultCoreIDs(mgr.ListCores())
	if len(defaults) != 1 || defaults[0] != "core-b" {
		t.Fatalf("删除默认内核后应提升剩余内核，defaults=%v cores=%#v", defaults, mgr.ListCores())
	}
}

func TestSQLiteGroupDAODeleteMovesChildrenAndProfilesInTransaction(t *testing.T) {
	db := newSQLiteBrowserTestDB(t)
	groupDAO := NewSQLiteGroupDAO(db.GetConn())
	profileDAO := NewSQLiteProfileDAO(db.GetConn())

	parent, err := groupDAO.Create(GroupInput{GroupName: "Parent"})
	if err != nil {
		t.Fatalf("创建父分组失败: %v", err)
	}
	target, err := groupDAO.Create(GroupInput{GroupName: "Target", ParentId: parent.GroupId})
	if err != nil {
		t.Fatalf("创建待删分组失败: %v", err)
	}
	child, err := groupDAO.Create(GroupInput{GroupName: "Child", ParentId: target.GroupId})
	if err != nil {
		t.Fatalf("创建子分组失败: %v", err)
	}
	if err := profileDAO.Upsert(&Profile{ProfileId: "profile-1", ProfileName: "Profile 1", GroupId: target.GroupId}); err != nil {
		t.Fatalf("创建实例失败: %v", err)
	}

	if err := groupDAO.Delete(target.GroupId); err != nil {
		t.Fatalf("删除分组失败: %v", err)
	}

	movedChild, err := groupDAO.GetById(child.GroupId)
	if err != nil {
		t.Fatalf("查询子分组失败: %v", err)
	}
	if movedChild.ParentId != parent.GroupId {
		t.Fatalf("子分组应移动到父分组: got=%q want=%q", movedChild.ParentId, parent.GroupId)
	}
	movedProfile, err := profileDAO.GetById("profile-1")
	if err != nil {
		t.Fatalf("查询实例失败: %v", err)
	}
	if movedProfile.GroupId != parent.GroupId {
		t.Fatalf("实例应移动到父分组: got=%q want=%q", movedProfile.GroupId, parent.GroupId)
	}
	if _, err := groupDAO.GetById(target.GroupId); err == nil {
		t.Fatalf("待删分组应不存在")
	}
}

func defaultCoreIDs(cores []Core) []string {
	out := make([]string, 0)
	for _, core := range cores {
		if core.IsDefault {
			out = append(out, core.CoreId)
		}
	}
	return out
}
